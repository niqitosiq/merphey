import { Logger } from './logger';
import { MetricsService } from './metrics';

export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

export interface ErrorContext {
  userId?: string;
  conversationId?: string;
  step?: string;
  input?: any;
  [key: string]: any;
}

export class ApplicationError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly severity: ErrorSeverity,
    public readonly context?: ErrorContext,
    public readonly originalError?: Error,
  ) {
    super(message);
    this.name = 'ApplicationError';
  }
}

export class ErrorBoundary {
  private static readonly logger = Logger.getInstance();
  private static readonly metrics = MetricsService.getInstance();

  static async wrap<T>(
    operation: () => Promise<T>,
    context: ErrorContext = {},
    errorMapping: Record<string, { severity: ErrorSeverity; message: string }> = {},
  ): Promise<T> {
    const startTime = Date.now();

    try {
      const result = await operation();

      // Record success metric
      this.metrics.recordMetric('operation_success', 1, {
        context_type: context.step || 'unknown',
      });

      return result;
    } catch (error) {
      // Map known errors to ApplicationError
      const applicationError = this.mapError(error, context, errorMapping);

      // Log the error with appropriate severity
      this.logError(applicationError);

      // Record error metrics
      this.recordErrorMetrics(applicationError);

      throw applicationError;
    } finally {
      // Record operation duration
      const duration = Date.now() - startTime;
      this.metrics.recordMetric('operation_duration', duration, {
        context_type: context.step || 'unknown',
      });
    }
  }

  private static mapError(
    error: any,
    context: ErrorContext,
    errorMapping: Record<string, { severity: ErrorSeverity; message: string }>,
  ): ApplicationError {
    // If it's already an ApplicationError, just return it
    if (error instanceof ApplicationError) {
      return error;
    }

    // Check if we have a mapping for this error
    const errorCode = error.code || error.name || 'UNKNOWN_ERROR';
    const mapping = errorMapping[errorCode];

    if (mapping) {
      return new ApplicationError(
        mapping.message,
        errorCode,
        mapping.severity,
        context,
        error,
      );
    }

    // Default error mapping based on error type
    if (error.name === 'TimeoutError') {
      return new ApplicationError(
        'The operation timed out',
        'TIMEOUT_ERROR',
        ErrorSeverity.HIGH,
        context,
        error,
      );
    }

    if (error.name === 'NetworkError') {
      return new ApplicationError(
        'A network error occurred',
        'NETWORK_ERROR',
        ErrorSeverity.HIGH,
        context,
        error,
      );
    }

    // Default unknown error
    return new ApplicationError(
      error.message || 'An unknown error occurred',
      'UNKNOWN_ERROR',
      ErrorSeverity.MEDIUM,
      context,
      error,
    );
  }

  private static logError(error: ApplicationError): void {
    const logMessage = `${error.code}: ${error.message}`;
    const logContext = {
      ...error.context,
      severity: error.severity,
      stack: error.originalError?.stack,
    };

    switch (error.severity) {
      case ErrorSeverity.LOW:
        this.logger.info(logMessage, logContext);
        break;
      case ErrorSeverity.MEDIUM:
        this.logger.warn(logMessage, logContext);
        break;
      case ErrorSeverity.HIGH:
      case ErrorSeverity.CRITICAL:
        this.logger.error(logMessage, logContext);
        break;
    }
  }

  private static recordErrorMetrics(error: ApplicationError): void {
    this.metrics.recordMetric('error_count', 1, {
      error_code: error.code,
      severity: error.severity,
      context_type: error.context?.step || 'unknown',
    });

    // Record specific metrics for critical errors
    if (error.severity === ErrorSeverity.CRITICAL) {
      this.metrics.recordMetric('critical_error_count', 1, {
        error_code: error.code,
      });
    }
  }

  static getErrorSummary(timeRange?: { start: number; end: number }): {
    totalErrors: number;
    errorsByType: Record<string, number>;
    criticalErrors: number;
  } {
    const metrics = this.metrics.getMetrics('error_count', timeRange?.start, timeRange?.end);
    const criticalErrors = this.metrics.getMetrics('critical_error_count', timeRange?.start, timeRange?.end);

    const errorsByType: Record<string, number> = {};
    metrics.forEach((metric) => {
      const errorCode = metric.tags.error_code;
      errorsByType[errorCode] = (errorsByType[errorCode] || 0) + 1;
    });

    return {
      totalErrors: metrics.length,
      errorsByType,
      criticalErrors: criticalErrors.length,
    };
  }
}