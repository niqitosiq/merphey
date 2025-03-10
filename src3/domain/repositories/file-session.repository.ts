import { SessionRepository } from './session.repository';
import { ConversationContext, ConversationState, RiskLevel } from '../models/conversation';
import fs from 'fs';
import path from 'path';
import { parse as csvParse, stringify as csvStringify } from 'csv-string';

export class FileSessionRepository implements SessionRepository {
  private sessions: Map<string, ConversationContext> = new Map();
  private readonly filePath: string;

  constructor(csvDirectory?: string) {
    // Set up the CSV directory (default to project root /data folder)
    this.filePath = path.resolve(csvDirectory || path.join(process.cwd(), 'data', 'sessions.csv'));

    // Ensure the directory exists
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Try to load existing sessions
    this.loadSessions().catch((err) => {
      console.warn('Could not load existing sessions:', err.message);
    });
  }

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
    await this.saveSessions();
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
    await this.saveSessions();
  }

  async delete(userId: string): Promise<void> {
    this.sessions.delete(userId);
    await this.saveSessions();
  }

  private cleanupStaleTasks(session: ConversationContext): void {
    if (!session.activeBackgroundTasks?.length) return;

    const now = Date.now();
    session.activeBackgroundTasks = session.activeBackgroundTasks.filter((taskId) => {
      const taskTime = parseInt(taskId.split('_')[1]);
      return now - taskTime < 5 * 60 * 1000; // 5 minutes
    });
  }

  private async saveSessions(): Promise<void> {
    try {
      const headers = [
        'userId',
        'state',
        'isThinking',
        'sessionStartTime',
        'lastUpdated',
        'riskLevel',
        'historyJson',
        'activeBackgroundTasksJson',
      ];

      const rows = Array.from(this.sessions.values()).map((session) => [
        session.userId,
        session.state,
        session.isThinking.toString(),
        session.sessionStartTime.toString(),
        session.lastUpdated.toString(),
        session.riskLevel,
        JSON.stringify(session.history),
        JSON.stringify(session.activeBackgroundTasks),
      ]);

      rows.unshift(headers);
      const csvContent = csvStringify(rows);
      await fs.promises.writeFile(this.filePath, csvContent, 'utf8');
    } catch (error) {
      console.error('Error saving sessions:', error);
      throw error;
    }
  }

  private async loadSessions(): Promise<void> {
    try {
      if (!fs.existsSync(this.filePath)) {
        return;
      }

      const content = await fs.promises.readFile(this.filePath, 'utf8');
      if (!content.trim()) {
        return;
      }

      const rows = csvParse(content);
      const headers = rows.shift();

      if (!headers) return;

      for (const row of rows) {
        try {
          if (row.length < 8) continue; // Skip invalid rows

          const session: ConversationContext = {
            userId: row[0],
            state: row[1] as ConversationState,
            isThinking: row[2] === 'true',
            sessionStartTime: parseInt(row[3]),
            lastUpdated: parseInt(row[4]),
            riskLevel: row[5] as RiskLevel,
            history: JSON.parse(row[6]),
            activeBackgroundTasks: JSON.parse(row[7]),
          };

          this.sessions.set(session.userId, session);
        } catch (parseError) {
          console.warn('Error parsing session row:', parseError);
        }
      }
    } catch (error) {
      console.error('Error loading sessions:', error);
      throw error;
    }
  }
}
