import { ConversationContext, ConversationState, RiskLevel } from '../models/conversation';

export interface SessionRepository {
  create(userId: string): Promise<ConversationContext>;
  findByUserId(userId: string): Promise<ConversationContext | null>;
  update(context: ConversationContext): Promise<void>;
  delete(userId: string): Promise<void>;
}

export class InMemorySessionRepository implements SessionRepository {
  private sessions: Map<string, ConversationContext> = new Map();

  async create(userId: string): Promise<ConversationContext> {
    const now = Date.now();
    const session: ConversationContext = {
      userId,
      history: [],
      state: ConversationState.INITIAL,
      isThinking: false,
      sessionStartTime: now,
      lastUpdated: now,
      riskLevel: 'LOW' as RiskLevel,
      activeBackgroundTasks: [],
    };

    this.sessions.set(userId, session);
    return session;
  }

  async findByUserId(userId: string): Promise<ConversationContext | null> {
    const session = this.sessions.get(userId);

    if (session) {
      // Clean up stale background tasks on retrieval
      this.cleanupStaleTasks(session);
    }

    return session || null;
  }

  async update(context: ConversationContext): Promise<void> {
    // Ensure we're not storing too much history
    if (context.history.length > 100) {
      context.history = context.history.slice(-100);
    }

    context.lastUpdated = Date.now();
    this.sessions.set(context.userId, context);
  }

  async delete(userId: string): Promise<void> {
    this.sessions.delete(userId);
  }

  private cleanupStaleTasks(session: ConversationContext): void {
    if (!session.activeBackgroundTasks?.length) return;

    const now = Date.now();
    session.activeBackgroundTasks = session.activeBackgroundTasks.filter((taskId) => {
      const taskTime = parseInt(taskId.split('_')[1]);
      return now - taskTime < 5 * 60 * 1000; // 5 minutes
    });
  }
}
