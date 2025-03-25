import { SessionRepository } from '../../ports/session.repository.port';
import { Session } from '../../aggregates/user/entities/Session';
import { User } from '../../aggregates/user/entities/User';
import { SessionStatus } from '../../shared/enums';
import { EventBus } from '../../../shared/events/EventBus';
import { EventTypes } from '../../../shared/events/EventTypes';
import { UserRepository } from '../../../infrastructure/persistence/postgres/UserRepository';

export class SessionService {
  constructor(
    private sessionRepository: SessionRepository,
    private userRepository: UserRepository,
    private eventBus: EventBus,
  ) {}

  async startSession(userId: User['id'], duration: number = 30): Promise<Session> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new Error(`User with ID ${userId} not found`);
    }
    // Check if user has enough balance
    if (!user.hasEnoughBalanceForSession) {
      throw new Error('Insufficient balance to start a session');
    }

    // Check if user already has an active session
    const activeSession = await this.sessionRepository.findActiveByUserId(userId);
    if (activeSession) {
      return activeSession;
    }

    // Deduct session cost from user's balance
    const session = await this.sessionRepository.create(userId, duration);
    user.deductSessionCost();
    this.userRepository.decrementBalance(userId, 1);

    // Create new session

    // publish session started event
    // this.eventBus.publish(EventTypes.SESSION_STARTED, {
    //   sessionId: session.id,
    //   userId: user.id,
    //   startTime: session.startTime,
    //   duration: session.duration,
    // });

    return session;
  }

  async getActiveSession(userId: string): Promise<Session | null> {
    return this.sessionRepository.findActiveByUserId(userId);
  }

  async completeSession(sessionId: string): Promise<Session> {
    const session = await this.sessionRepository.findById(sessionId);

    if (!session) {
      throw new Error(`Session with ID ${sessionId} not found`);
    }

    if (session.status !== SessionStatus.ACTIVE) {
      throw new Error('Cannot complete a session that is not active');
    }

    const now = new Date();
    const updatedSession = await this.sessionRepository.updateStatus(
      sessionId,
      SessionStatus.COMPLETED,
      now,
    );

    // publish session completed event
    this.eventBus.publish(EventTypes.SESSION_COMPLETED, {
      sessionId: updatedSession.id,
      userId: updatedSession.userId,
      endTime: now,
    });

    return updatedSession;
  }

  async expireSession(sessionId: string): Promise<Session> {
    const session = await this.sessionRepository.findById(sessionId);

    if (!session) {
      throw new Error(`Session with ID ${sessionId} not found`);
    }

    if (session.status !== SessionStatus.ACTIVE) {
      throw new Error('Cannot expire a session that is not active');
    }

    const now = new Date();
    const updatedSession = await this.sessionRepository.updateStatus(
      sessionId,
      SessionStatus.EXPIRED,
      now,
    );

    // publish session expired event
    this.eventBus.publish(EventTypes.SESSION_EXPIRED, {
      sessionId: updatedSession.id,
      userId: updatedSession.userId,
      endTime: now,
    });

    return updatedSession;
  }
}
