import TelegramBot from 'node-telegram-bot-api';
import { TelegramSession } from '../telegram-types';
import { ConversationState } from '../../../domain/user-interaction/value-objects/conversation-state.value-object';

export class AuthMiddleware {
  private sessions: Map<number, TelegramSession> = new Map();

  constructor() {
    setInterval(() => this.cleanupSessions(), 1800000); // 30 minutes
  }

  public async handle(msg: TelegramBot.Message): Promise<TelegramSession> {
    const userId = msg.from?.id;
    if (!userId) {
      throw new Error('Unauthorized: Missing user ID');
    }

    const session = this.sessions.get(userId);
    if (!session) {
      // Create new session for new user
      const newSession: TelegramSession = {
        user: {
          id: userId.toString(),
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        state: ConversationState.INITIAL,
        lastInteraction: new Date(),
      };

      this.sessions.set(userId, newSession);
      return newSession;
    }

    // Update last interaction time
    session.lastInteraction = new Date();
    return session;
  }

  private cleanupSessions(): void {
    const expiryTime = new Date();
    expiryTime.setHours(expiryTime.getHours() - 24); // 24 hour expiry

    for (const [userId, session] of this.sessions.entries()) {
      if (session.lastInteraction < expiryTime) {
        this.sessions.delete(userId);
      }
    }
  }

  public getSession(userId: number): TelegramSession | undefined {
    return this.sessions.get(userId);
  }
}
