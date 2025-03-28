import { SessionRepository } from '../../ports/session.repository.port';
import { Session } from '../../aggregates/user/entities/Session';
import { User } from '../../aggregates/user/entities/User';
import { EventBus } from '../../../shared/events/EventBus';
import { EventTypes } from '../../../shared/events/EventTypes';
import { UserRepository } from '../../../infrastructure/persistence/postgres/UserRepository';
import { SessionError } from '../../../shared/errors/domain-errors';
import { SessionStatus } from '@prisma/client';
import { scoped, Lifecycle, injectable, autoInjectable } from 'tsyringe';


@scoped(Lifecycle.ContainerScoped)
@injectable()
@autoInjectable()
export class SessionService {
  constructor(
    private sessionRepository: SessionRepository,
    private userRepository: UserRepository,
    private eventBus: EventBus,
  ) {}

  async startSession(userId: User['id'], duration: number = 30): Promise<Session> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new SessionError('User not found', undefined, userId, 'USER_NOT_FOUND');
    }

    if (!user.hasEnoughBalanceForSession) {
      throw new SessionError('Insufficient balance', undefined, userId, 'INSUFFICIENT_BALANCE');
    }

    const activeSession = await this.sessionRepository.findActiveByUserId(userId);
    if (activeSession) {
      return activeSession;
    }

    // Create new session and deduct cost
    const session = await this.sessionRepository.create(userId, duration);
    user.deductSessionCost();
    await this.userRepository.decrementBalance(userId, 1);

    this.eventBus.publish(EventTypes.SESSION_STARTED, {
      sessionId: session.id,
      userId: user.id,
      startTime: session.startTime,
      duration: session.duration,
    });

    return session;
  }

  async getActiveSession(userId: string): Promise<Session | null> {
    const session = await this.sessionRepository.findActiveByUserId(userId);

    if (!session?.hasTimeRemaining) {
      if (session) {
        await this.expireSession(session.id);
      }
      return null;
    }

    return this.sessionRepository.findActiveByUserId(userId);
  }

  async completeSession(sessionId: string): Promise<Session> {
    const session = await this.sessionRepository.findById(sessionId);

    if (!session) {
      throw new SessionError('Session not found', sessionId, undefined, 'SESSION_NOT_FOUND');
    }

    if (session.status !== SessionStatus.ACTIVE) {
      throw new SessionError(
        'Cannot complete inactive session',
        sessionId,
        session.userId,
        'INVALID_STATUS',
      );
    }

    const now = new Date();
    const updatedSession = await this.sessionRepository.updateStatus(
      sessionId,
      SessionStatus.COMPLETED,
      now,
    );

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
      throw new SessionError('Session not found', sessionId, undefined, 'SESSION_NOT_FOUND');
    }

    if (session.status !== SessionStatus.ACTIVE) {
      throw new SessionError(
        'Cannot expire inactive session',
        sessionId,
        session.userId,
        'INVALID_STATUS',
      );
    }

    const now = new Date();
    const updatedSession = await this.sessionRepository.updateStatus(
      sessionId,
      SessionStatus.EXPIRED,
      now,
    );

    this.eventBus.publish(EventTypes.SESSION_EXPIRED, {
      sessionId: updatedSession.id,
      userId: updatedSession.userId,
      endTime: now,
    });

    return updatedSession;
  }
}
