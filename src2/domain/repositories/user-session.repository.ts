import NodeCache from 'node-cache';
import { UserSession, CreateUserSessionParams, UserSessionFactory } from '../entities/user-session';

export interface UserSessionRepository {
  create(params: CreateUserSessionParams): Promise<UserSession>;
  findByUserId(userId: string): Promise<UserSession | null>;
  update(session: UserSession): Promise<UserSession>;
}

export class UserSessionRepositoryImpl implements UserSessionRepository {
  private cache: NodeCache;

  constructor() {
    // Cache with TTL of 1 hour for user sessions
    this.cache = new NodeCache({ stdTTL: 3600 });
  }

  async create(params: CreateUserSessionParams): Promise<UserSession> {
    const session = UserSessionFactory.create(params);
    console.log(session, 'session');

    this.cache.set(session.userId, session);
    return session;
  }

  async update(session: UserSession): Promise<UserSession> {
    session.lastInteractionAt = new Date();
    this.cache.set(session.id, session);
    return session;
  }

  async findByUserId(userId: string): Promise<UserSession | null> {
    const sessions = this.cache.mget<UserSession>(this.cache.keys());
    return Object.values(sessions).find((session) => session.userId === userId) || null;
  }
}
