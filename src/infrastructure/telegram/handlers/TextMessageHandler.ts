import { MentalHealthApplication } from '../../../application/MentalHealthApplication';
import { SessionResponse } from '../../../domain/aggregates/conversation/entities/types';

/**
 * Handler for text messages received from Telegram
 * Processes regular text messages from users and routes them to the core application
 */
export class TextMessageHandler {
  /**
   * Creates a new text message handler
   * @param application - Core application instance
   */
  constructor(private readonly application: MentalHealthApplication) {}

  /**
   * Handles a text message from a user
   * @param userId - The Telegram user ID
   * @param messageText - The message content
   * @param userLanguage - The language of the user
   * @returns Promise<string> - Response message to send to the user
   */
  async handleMessage(userId: string, messageText: string): Promise<string> {
    try {
      // Log received message (with sensitive data protection)
      console.log(`Processing message: ${this.formatLogMessage(userId, messageText)}`);

      // Sanitize user input - remove potentially harmful content
      const sanitizedMessage = this.sanitizeInput(messageText);

      // Process the message through the main application with language info
      const response: SessionResponse = await this.application.handleMessage(
        userId,
        sanitizedMessage,
      );

      // Format response for telegram
      return this.formatResponse(response);
    } catch (error) {
      console.error(`Error processing message from ${userId}:`, error);
      return this.generateErrorMessage(error);
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
   * @param language - The language of the user
   * @returns string - User-friendly error message
   */
  private generateErrorMessage(error: any): string {
    // Check for specific error types and provide appropriate messages
    if (error.name === 'ValidationError') {
      return "I couldn't understand your message. Could you phrase it differently?";
    }

    if (error.name === 'RateLimitError') {
      return "You're sending messages too quickly. Please wait a moment before trying again.";
    }

    if (error.name === 'ServiceUnavailableError') {
      return "I'm having trouble connecting to my services right now. Please try again in a few minutes.";
    }

    // Default error message
    return 'Something went wrong while processing your message. Please try again later.';
  }

  /**
   * Retrieves localized validation error message
   * @param language - The language of the user
   * @returns string - Localized validation error message
   */
  private getLocalizedValidationError(language: string): string {
    const errorMessages: Record<string, string> = {
      es: 'No pude entender tu mensaje. ¿Podrías expresarlo de otra manera?',
      fr: "Je n'ai pas pu comprendre votre message. Pourriez-vous le formuler différemment ?",
      // Add more languages as needed
    };
    return errorMessages[language] || errorMessages['en'];
  }

  /**
   * Retrieves localized rate limit error message
   * @param language - The language of the user
   * @returns string - Localized rate limit error message
   */
  private getLocalizedRateLimitError(language: string): string {
    const errorMessages: Record<string, string> = {
      es: 'Estás enviando mensajes demasiado rápido. Por favor, espera un momento antes de intentar nuevamente.',
      fr: 'Vous envoyez des messages trop rapidement. Veuillez attendre un moment avant de réessayer.',
      // Add more languages as needed
    };
    return errorMessages[language] || errorMessages['en'];
  }

  /**
   * Retrieves localized service unavailable error message
   * @param language - The language of the user
   * @returns string - Localized service unavailable error message
   */
  private getLocalizedServiceError(language: string): string {
    const errorMessages: Record<string, string> = {
      es: 'Tengo problemas para conectarme a mis servicios en este momento. Por favor, inténtalo de nuevo en unos minutos.',
      fr: "J'ai des difficultés à me connecter à mes services pour le moment. Veuillez réessayer dans quelques minutes.",
      // Add more languages as needed
    };
    return errorMessages[language] || errorMessages['en'];
  }

  /**
   * Retrieves localized generic error message
   * @param language - The language of the user
   * @returns string - Localized generic error message
   */
  private getLocalizedGenericError(language: string): string {
    const errorMessages: Record<string, string> = {
      es: 'Algo salió mal al procesar tu mensaje. Por favor, inténtalo de nuevo más tarde.',
      fr: "Une erreur s'est produite lors du traitement de votre message. Veuillez réessayer plus tard.",
      // Add more languages as needed
    };
    return errorMessages[language] || errorMessages['en'];
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
