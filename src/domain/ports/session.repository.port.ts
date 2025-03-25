import { Session } from '../aggregates/user/entities/Session';

export interface SessionRepository {
  create(userId: string, duration: number): Promise<Session>;
  findById(sessionId: string): Promise<Session | null>;
  findActiveByUserId(userId: string): Promise<Session | null>;
  updateStatus(sessionId: string, status: string, endTime?: Date): Promise<Session>;
  findExpiredSessions(): Promise<Session[]>;
}
