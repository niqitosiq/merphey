import TelegramBot from 'node-telegram-bot-api';

interface RateLimitEntry {
  count: number;
  firstRequest: number;
}

export class RateLimiter {
  private limits: Map<number, RateLimitEntry> = new Map();
  private readonly WINDOW_MS = 60000; // 1 minute

  constructor(private requestsPerMinute: number) {
    setInterval(() => this.cleanup(), this.WINDOW_MS);
  }

  public async handle(msg: TelegramBot.Message): Promise<void> {
    const userId = msg.from?.id;
    if (!userId) return;

    const now = Date.now();
    const userLimit = this.limits.get(userId);

    if (!userLimit) {
      this.limits.set(userId, { count: 1, firstRequest: now });
      return;
    }

    // Reset if window has passed
    if (now - userLimit.firstRequest > this.WINDOW_MS) {
      this.limits.set(userId, { count: 1, firstRequest: now });
      return;
    }

    // Increment count
    userLimit.count++;

    // Check if limit exceeded
    if (userLimit.count > this.requestsPerMinute) {
      throw new Error('Rate limit exceeded. Please wait before sending more messages.');
    }
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [userId, entry] of this.limits.entries()) {
      if (now - entry.firstRequest > this.WINDOW_MS) {
        this.limits.delete(userId);
      }
    }
  }
}
