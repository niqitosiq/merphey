import { RiskLevel } from '@prisma/client';
import { SessionResponse } from '../../domain/aggregates/conversation/entities/types';

/**
 * Custom error classes for application-level errors
 * Provides structured error handling for the application layer
 */

type ErrorMetadata = Record<string, any>;

/**
 * Base application error class
 */
export class ApplicationError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL',
    public readonly metadata?: ErrorMetadata,
  ) {
    super(message);
    this.name = 'ApplicationError';
  }

  /**
   * Creates a user-friendly error response
   */
  toSessionResponse(): SessionResponse {
    return {
      message: 'I apologize, but I encountered an issue. Please try again in a moment.',
    };
  }
}

/**
 * Error for message processing failures
 */
export class MessageProcessingError extends ApplicationError {
  constructor(
    message: string,
    public readonly originalError?: Error,
    metadata?: ErrorMetadata,
  ) {
    super(message, 'MESSAGE_PROCESSING_ERROR', 'MEDIUM', metadata);
  }
}

/**
 * Error for conversation context retrieval failures
 */
export class ContextRetrievalError extends ApplicationError {
  constructor(
    message: string,
    public readonly userId: string,
    public readonly originalError?: Error,
  ) {
    super(message, 'CONTEXT_RETRIEVAL_ERROR', 'HIGH', {
      userId,
      originalError: originalError?.message,
    });
  }
}

/**
 * Error for therapeutic plan operations
 */
export class PlanOperationError extends ApplicationError {
  constructor(
    message: string,
    code: string,
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL',
    public readonly planId?: string,
    public readonly originalError?: Error,
  ) {
    super(message, code, severity, {
      planId,
      originalError: originalError?.message,
    });
  }
}

/**
 * Error handler service for the application
 */
export class ErrorHandler {
  /**
   * Handles errors occurring during message processing
   * @param error - The error that occurred
   * @param userId - ID of the user whose message generated the error
   * @returns SessionResponse - Fallback response for the user
   */
  async handleProcessingError(error: Error, userId: string): Promise<SessionResponse> {
    // Log error for monitoring
    console.error('Processing error:', {
      userId,
      error:
        error instanceof ApplicationError
          ? {
              code: error.code,
              message: error.message,
              severity: error.severity,
              metadata: error.metadata,
            }
          : {
              message: error.message,
              stack: error.stack,
            },
    });

    // Notify developers of critical errors
    if (error instanceof ApplicationError && error.severity === 'CRITICAL') {
      // await this.notificationService.notifyDevelopers({
      //   type: 'error',
      //   title: 'Critical Error',
      //   message: error.message,
      //   metadata: {
      //     userId,
      //     errorCode: error.code,
      //     ...error.metadata,
      //   },
      // });
    }

    // Generate appropriate fallback response
    if (error instanceof ApplicationError) {
      return error.toSessionResponse();
    }

    // Generic error response
    return {
      message: 'I apologize, but something went wrong. Please try again later.',
    };
  }

  /**
   * Creates an appropriate error response for the user
   * @param error - The error to handle
   * @returns SessionResponse - User-friendly error response
   */
  createErrorResponse(error: Error): SessionResponse {
    if (error instanceof ApplicationError) {
      return error.toSessionResponse();
    }

    return {
      message: 'I encountered an unexpected issue. Please try again.',
      metadata: {
        state: 'SESSION_CLOSING',
        riskLevel: RiskLevel.LOW,
      },
    };
  }
}

export class LlmServiceError extends ApplicationError {
  constructor(message: string, code: string) {
    super(message, code, 'CRITICAL');
  }
}
