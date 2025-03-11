type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: any;
}

export class Logger {
  private static instance: Logger;
  private isDevelopment: boolean;

  private constructor() {
    this.isDevelopment = true;
  }

  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  private formatMessage(level: LogLevel, message: string, context?: any): LogEntry {
    return {
      timestamp: new Date().toISOString(),
      level,
      message,
      context,
    };
  }

  private log(level: LogLevel, message: string, context?: any): void {
    const entry = this.formatMessage(level, message, context);

    if (this.isDevelopment) {
      const color = {
        debug: '\x1b[36m', // cyan
        info: '\x1b[32m', // green
        warn: '\x1b[33m', // yellow
        error: '\x1b[31m', // red
      }[level];

      console.log(
        `${color}[${entry.timestamp}] ${level.toUpperCase()}: ${entry.message}\x1b[0m`,
        entry.context ? '\nContext:' : '',
        entry.context || '',
      );
    } else {
      // In production, we might want to send logs to a service
      console.log(JSON.stringify(entry));
    }
  }

  debug(message: string, context?: any): void {
    if (this.isDevelopment) {
      this.log('debug', message, context);
    }
  }

  info(message: string, context?: any): void {
    this.log('info', message, context);
  }

  warn(message: string, context?: any): void {
    this.log('warn', message, context);
  }

  error(message: string, context?: any): void {
    this.log('error', message, context);
  }

  logConversationStep(userId: string, step: string, details: any): void {
    this.debug(`Conversation step: ${step}`, {
      userId,
      step,
      ...details,
    });
  }
}
