import NodeCache from 'node-cache';
import { UserSession, CreateUserSessionParams, UserSessionFactory } from '../entities/user-session';

export interface UserSessionRepository {
  create(params: CreateUserSessionParams): Promise<UserSession>;
  findById(id: string): Promise<UserSession | null>;
  findByUserId(userId: string): Promise<UserSession | null>;
  update(session: UserSession): Promise<UserSession>;
  delete(id: string): Promise<void>;
  findActiveByUserId(userId: string): Promise<UserSession | null>;
}

export class UserSessionRepositoryImpl implements UserSessionRepository {
  private cache: NodeCache;

  constructor() {
    // Cache with TTL of 1 hour for user sessions
    this.cache = new NodeCache({ stdTTL: 3600 });
  }

  async create(params: CreateUserSessionParams): Promise<UserSession> {
    const session = UserSessionFactory.create(params);
    this.cache.set(session.id, session);
    return session;
  }

  async findById(id: string): Promise<UserSession | null> {
    return this.cache.get<UserSession>(id) || null;
  }

  async findByUserId(userId: string): Promise<UserSession | null> {
    const sessions = this.cache.mget<UserSession>(this.cache.keys());
    return Object.values(sessions).find(session => session.userId === userId) || null;
  }

  async update(session: UserSession): Promise<UserSession> {
    session.lastInteractionAt = new Date();
    this.cache.set(session.id, session);
    return session;
  }

  async delete(id: string): Promise<void> {
    this.cache.del(id);
  }

  async findActiveByUserId(userId: string): Promise<UserSession | null> {
    const session = await this.findByUserId(userId);
    if (session && !session.isComplete) {
      return session;
    }
    return null;
  }
}
