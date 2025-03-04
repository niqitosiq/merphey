import NodeCache from 'node-cache';
import { UserSession } from '../entities/user-session';

export class UserSessionRepository {
  private cache: NodeCache;

  constructor() {
    // Cache with TTL of 1 hour for user sessions
    this.cache = new NodeCache({ stdTTL: 3600 });
  }

  /**
   * Get user session by ID or create a new one if it doesn't exist
   */
  getOrCreateSession(userId: string): UserSession {
    const existingSession = this.cache.get<UserSession>(userId);
    if (existingSession) {
      return existingSession;
    }

    const newSession = new UserSession(userId);
    this.saveSession(newSession);
    return newSession;
  }

  /**
   * Save user session to cache
   */
  saveSession(session: UserSession): void {
    this.cache.set(session.userId, session);
  }

  /**
   * Delete user session from cache
   */
  deleteSession(userId: string): void {
    this.cache.del(userId);
  }

  /**
   * Clear all sessions from cache
   */
  clearAllSessions(): void {
    this.cache.flushAll();
  }
}
