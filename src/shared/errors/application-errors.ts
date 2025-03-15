import { SessionResponse } from '../../domain/aggregates/conversation/entities/types';
import { NotificationService } from '../../infrastructure/messaging/NotificationService';

/**
 * Custom error classes for application-level errors
 * Provides structured error handling for the application layer
 */

/**
 * Base application error class
 */
export class ApplicationError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL',
  ) {
    super(message);
    this.name = 'ApplicationError';
  }
}

/**
 * Error for message processing failures
 */
export class MessageProcessingError extends ApplicationError {
  constructor(
    message: string,
    public readonly originalError?: Error,
  ) {
    super(message, 'MESSAGE_PROCESSING_ERROR', 'MEDIUM');
    this.name = 'MessageProcessingError';
  }
}

/**
 * Error for LLM service failures
 */
export class LlmServiceError extends ApplicationError {
  constructor(
    message: string,
    public readonly serviceProvider: string,
  ) {
    super(message, 'LLM_SERVICE_ERROR', 'HIGH');
    this.name = 'LlmServiceError';
  }
}

/**
 * Error handler service for application-wide error management
 * Provides consistent error handling and fallback responses
 */
export class ErrorHandler {
  constructor(private notificationService: NotificationService) {}

  /**
   * Handles errors occurring during message processing
   * @param error - The error that occurred
   * @param userId - ID of the user whose message generated the error
   * @returns SessionResponse - Fallback response for the user
   */
  handleProcessingError(error: Error, userId: string): SessionResponse {
    // Will log error details for monitoring
    // Will classify error type and severity
    // Will notify developers of critical errors
    // Will generate appropriate fallback response
    // Will preserve conversation state when possible
    // Will ensure error doesn't impact user safety
  }

  /**
   * Logs an error to monitoring system
   * @param error - The error to log
   * @param context - Additional context information
   */
  private logError(error: Error, context: Record<string, any>): void {
    // Will format error for logging system
    // Will include stack trace and context
    // Will add timestamp and error classification
    // Will handle different logging targets based on severity
  }
}
