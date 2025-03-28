import {
  PrismaClient,
  Session as PrismaSession,
  ConversationSessionLog as PrismaConversationSessionLog,
  SessionStatus,
} from '@prisma/client';
import { Session } from '../../../domain/aggregates/user/entities/Session';
import { SessionRepository as SessionRepositoryPort } from '../../../domain/ports/session.repository.port';
import { scoped, Lifecycle, injectable, autoInjectable } from 'tsyringe';


@scoped(Lifecycle.ContainerScoped)
@injectable()
@autoInjectable()
export class SessionRepository implements SessionRepositoryPort {
  constructor(private prisma: PrismaClient) {}

  async create(userId: string, duration: number): Promise<Session> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (user?.balance === undefined || user.balance <= 0) {
      throw new Error('User balance is insufficient');
    }

    const session = await this.prisma.session.create({
      data: {
        userId,
        duration,
        status: SessionStatus.ACTIVE,
      },
    });

    return this.mapToDomainModel(session);
  }

  async findById(sessionId: string): Promise<Session | null> {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
    });

    return session ? this.mapToDomainModel(session) : null;
  }

  async findActiveByUserId(userId: string): Promise<Session | null> {
    const session = await this.prisma.session.findFirst({
      where: {
        userId,
        status: SessionStatus.ACTIVE,
      },
    });

    return session ? this.mapToDomainModel(session) : null;
  }

  async updateStatus(sessionId: string, status: string, endTime?: Date): Promise<Session> {
    const session = await this.prisma.session.update({
      where: { id: sessionId },
      data: {
        status: status as SessionStatus,
        endTime: endTime || undefined,
      },
    });

    return this.mapToDomainModel(session);
  }

  async findExpiredSessions(): Promise<Session[]> {
    const now = new Date();
    const activeSessions = await this.prisma.session.findMany({
      where: {
        status: SessionStatus.ACTIVE,
      },
    });

    // Filter out sessions that have not yet expired based on their duration
    const expiredSessions = activeSessions.filter((session) => {
      const expirationTime = new Date(session.startTime.getTime() + session.duration * 60 * 1000);
      return expirationTime <= now;
    });

    return expiredSessions.map((session) => this.mapToDomainModel(session));
  }

  private mapToDomainModel(prismaSession: PrismaSession): Session {
    return new Session(
      prismaSession.id,
      prismaSession.userId,
      prismaSession.startTime,
      prismaSession.endTime,
      prismaSession.duration,
      prismaSession.status,
      prismaSession.createdAt,
      prismaSession.updatedAt,
    );
  }
}
