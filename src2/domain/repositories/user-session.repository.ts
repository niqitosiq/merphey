import NodeCache from 'node-cache';
import { UserSession, CreateUserSessionParams, UserSessionFactory } from '../entities/user-session';
import fs from 'fs';
import path from 'path';
import { parse as csvParse, stringify as csvStringify } from 'csv-string';

export interface UserSessionRepository {
  create(params: CreateUserSessionParams): Promise<UserSession>;
  findByUserId(userId: string): Promise<UserSession | null>;
  update(session: UserSession): Promise<UserSession>;
  saveSessionsToCsv(filePath?: string): Promise<void>;
  loadSessionsFromCsv(filePath?: string): Promise<void>;
}

export class UserSessionRepositoryImpl implements UserSessionRepository {
  private cache: NodeCache;
  private readonly defaultCsvPath: string;

  constructor(csvDirectory?: string) {
    // Cache with TTL of 1 hour for user sessions
    this.cache = new NodeCache({ stdTTL: 3600 });

    // Set up the CSV directory (default to project root /data folder)
    this.defaultCsvPath = path.resolve(
      csvDirectory || path.join(process.cwd(), 'data', 'sessions.csv'),
    );

    // Ensure the directory exists
    const dir = path.dirname(this.defaultCsvPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Try to load existing sessions
    this.loadSessionsFromCsv().catch((err) => {
      // console.warn('Could not load existing sessions:', err.message);
    });
  }

  async create(params: CreateUserSessionParams): Promise<UserSession> {
    const session = UserSessionFactory.create(params);

    this.cache.set(session.userId, session);

    // Backup sessions after creating a new one
    await this.saveSessionsToCsv().catch((err) => {
      // console.error('Failed to save sessions to CSV:', err);
    });

    return session;
  }

  async update(session: UserSession): Promise<UserSession> {
    session.lastInteractionAt = new Date();
    this.cache.set(session.id, session);

    // Backup sessions after update
    await this.saveSessionsToCsv().catch((err) => {
      // console.error('Failed to save sessions to CSV:', err);
    });

    return session;
  }

  async findByUserId(userId: string): Promise<UserSession | null> {
    const sessions = this.cache.mget<UserSession>(this.cache.keys());
    return Object.values(sessions).find((session) => session.userId === userId) || null;
  }

  // Save all sessions to a CSV file
  async saveSessionsToCsv(filePath?: string): Promise<void> {
    const savePath = filePath || this.defaultCsvPath;
    const sessions = this.cache.mget<UserSession>(this.cache.keys());

    if (Object.keys(sessions).length === 0) {
      return;
    }

    try {
      // Create headers from the first session
      const firstSession = Object.values(sessions)[0];
      const headers = [
        'id',
        'userId',
        'isComplete',
        'lastInteractionAt',
        'createdAt',
        'historyJSON',
      ];

      // Prepare rows
      const rows = Object.values(sessions).map((session) => {
        // Serialize dates and complex objects
        return [
          session.id,
          session.userId,
          session.isComplete.toString(),
          session.lastInteractionAt.toISOString(),
          session.createdAt.toISOString(),
          JSON.stringify(session.history || []),
        ];
      });

      // Add headers as first row
      rows.unshift(headers);

      // Convert to CSV
      const csvContent = csvStringify(rows);

      // Write to file
      fs.writeFileSync(savePath, csvContent, 'utf8');
      // console.log(`Sessions backed up to ${savePath}`);
    } catch (error) {
      // console.error('Error saving sessions to CSV:', error);
      throw error;
    }
  }

  // Load sessions from a CSV file
  async loadSessionsFromCsv(filePath?: string): Promise<void> {
    const loadPath = filePath || this.defaultCsvPath;

    try {
      if (!fs.existsSync(loadPath)) {
        // console.log(`No session backup found at ${loadPath}`);
        return;
      }

      const fileContent = fs.readFileSync(loadPath, 'utf8');
      if (!fileContent.trim()) {
        // console.log(`Empty session backup file at ${loadPath}`);
        return;
      }

      const rows = csvParse(fileContent);
      const headers = rows.shift();

      if (!headers) return;

      // Process each row
      for (const row of rows) {
        try {
          if (row.length < 6) continue; // Skip invalid rows

          const session: UserSession = {
            id: row[0],
            userId: row[1],
            isComplete: row[2] === 'true',
            lastInteractionAt: new Date(row[3]),
            createdAt: new Date(row[4]),
            history: JSON.parse(row[5] || '[]'),
          };

          // Add to cache
          this.cache.set(session.userId, session);
        } catch (parseError) {
          // console.warn('Error parsing session row:', parseError);
        }
      }

      // console.log(`Loaded ${rows.length} sessions from ${loadPath}`);
    } catch (error) {
      // console.error('Error loading sessions from CSV:', error);
      throw error;
    }
  }
}
