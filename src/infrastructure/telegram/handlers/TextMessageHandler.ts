import { SessionService } from 'src/domain/services/session/SessionService';
import { MentalHealthApplication } from '../../../application/MentalHealthApplication';
import { SessionResponse } from '../../../domain/aggregates/conversation/entities/types';
import { EventBus } from 'src/shared/events/EventBus';

/**
 * Handler for text messages received from Telegram
 * Processes regular text messages from users and routes them to the core application
 */
export class TextMessageHandler {
  /**
   * Creates a new text message handler
   * @param application - Core application instance
   */
  constructor(
    private readonly application: MentalHealthApplication,
    private readonly sessionService: SessionService,
    private readonly eventBus: EventBus,
  ) {}

  /**
   * Handles a text message from a user
   * @param userId - The Telegram user ID
   * @param messageText - The message content
   * @param userLanguage - The language of the user
   * @returns Promise<string> - Response message to send to the user
   */
  async handleMessage(userId: string, messageText: string): Promise<string[]> {
    try {
      const messages = [];
      // Log received message (with sensitive data protection)
      console.log(`Processing message: ${this.formatLogMessage(userId, messageText)}`);

      try {
        // 1. Check if user has an active session
        const activeSession = await this.sessionService.startSession(userId);
        // const activeSession = await this.sessionService.getActiveSession(userId);
        if (!activeSession) {
          try {
            await this.sessionService.startSession(userId);
          } catch (error: any) {
            if (error.message === 'Insufficient balance to start a session') {
              messages.push(
                'У вас недостаточно средств для начала сессии. Пожалуйста, пополните баланс. /buy',
              );
            }
          }

          messages.push('Ваша сессия длинной в 30 минут началась.');
        }

        // 2. Check if session has time remaining
        if (!activeSession.hasTimeRemaining) {
          await this.sessionService.expireSession(activeSession.id);
          messages.push('Ваша сессия истекла, пожалуйста, начните новую сессию.');
        }
      } catch (error) {
        console.error('Error checking session:', error);
        throw new Error('Failed to check session');
      }

      // Sanitize user input - remove potentially harmful content
      const sanitizedMessage = this.sanitizeInput(messageText);

      // Process the message through the main application with language info
      const response: SessionResponse = await this.application.handleMessage(
        userId,
        sanitizedMessage,
      );

      messages.push(this.formatResponse(response));
      // Format response for telegram
      return messages;
    } catch (error) {
      console.error(`Error processing message from ${userId}:`, error);
      return [this.generateErrorMessage(error)];
    }
  }

  /**
   * Sanitizes user input to prevent injection and other security issues
   * @param messageText - Raw message from the user
   * @returns string - Sanitized input
   */
  private sanitizeInput(messageText: string): string {
    // Remove control characters and zero-width spaces
    let sanitized = messageText.replace(
      /[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u2028-\u202F]/g,
      '',
    );

    // Trim excessive whitespace
    sanitized = sanitized.replace(/\s+/g, ' ').trim();

    // Limit message length to reasonable size (prevent DoS)
    const MAX_LENGTH = 1000;
    if (sanitized.length > MAX_LENGTH) {
      sanitized = sanitized.substring(0, MAX_LENGTH);
    }

    return sanitized;
  }

  /**
   * Formats the application response for sending to Telegram
   * @param response - Application response object
   * @returns string - Formatted response text
   */
  private formatResponse(response: SessionResponse): string {
    // Basic formatting - in a real app, this would be more sophisticated
    let formattedResponse = response.message;

    return formattedResponse;
  }

  /**
   * Generates an appropriate error message based on the error type
   * @param error - The caught error
   * @returns string - User-friendly error message
   */
  private generateErrorMessage(error: any): string {
    // Check for specific error types and provide appropriate messages
    if (error.name === 'ValidationError') {
      return 'Я не смог понять ваше сообщение. Не могли бы вы сформулировать его иначе?';
    }

    if (error.name === 'RateLimitError') {
      return 'Вы отправляете сообщения слишком быстро. Пожалуйста, подождите немного перед следующей попыткой.';
    }

    if (error.name === 'ServiceUnavailableError') {
      return 'У меня проблемы с подключением к сервисам. Пожалуйста, попробуйте снова через несколько минут.';
    }

    // Default error message
    return 'Что-то пошло не так при обработке вашего сообщения. Пожалуйста, попробуйте позже.';
  }

  /**
   * Formats user message for log display
   * @param userId - The Telegram user ID
   * @param messageText - The message content
   * @returns string - Formatted log entry
   */
  private formatLogMessage(userId: string, messageText: string): string {
    // Truncate very long messages for log display
    const MAX_LOG_LENGTH = 100;
    let truncatedMessage = messageText;

    if (truncatedMessage.length > MAX_LOG_LENGTH) {
      truncatedMessage = truncatedMessage.substring(0, MAX_LOG_LENGTH) + '...';
    }

    // Sanitize any sensitive information from logs
    // This is a simple example - in a real app, you'd use a more sophisticated approach
    truncatedMessage = truncatedMessage.replace(
      /password|credit|card|ssn|social security|phone/gi,
      '[REDACTED]',
    );

    return `User ${userId.substring(0, 5)}***: ${truncatedMessage}`;
  }
}
