/**
 * Custom error classes for domain-level errors
 * Provides structured error handling for the domain layer
 */

/**
 * Base domain error class
 */
export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DomainError';
  }
}

/**
 * Error for invalid therapeutic plan operations
 */
export class PlanValidationError extends DomainError {
  constructor(
    message: string,
    public readonly planId: string,
    public readonly versionId?: string,
  ) {
    super(`Plan validation error (${planId}): ${message}`);
    this.name = 'PlanValidationError';
  }
}

/**
 * Error for invalid conversation state transitions
 */
export class InvalidStateTransitionError extends DomainError {
  constructor(
    public readonly fromState: string,
    public readonly toState: string,
    public readonly reason: string,
  ) {
    super(`Invalid state transition from ${fromState} to ${toState}: ${reason}`);
    this.name = 'InvalidStateTransitionError';
  }
}

/**
 * Error for risk assessment failures
 */
export class RiskAssessmentError extends DomainError {
  constructor(
    message: string,
    public readonly factors: string[],
  ) {
    super(`Risk assessment error: ${message}`);
    this.name = 'RiskAssessmentError';
  }
}

/**
 * Error for message validation failures
 */
export class MessageValidationError extends DomainError {
  constructor(
    message: string,
    public readonly violations: string[],
  ) {
    super(`Message validation error: ${message}`);
    this.name = 'MessageValidationError';
  }
}

/**
 * Error for cognitive analysis failures
 */
export class AnalysisError extends DomainError {
  constructor(
    message: string,
    public readonly analysisType: string,
  ) {
    super(`Analysis error (${analysisType}): ${message}`);
    this.name = 'AnalysisError';
  }
}

/**
 * Error for session operations
 */
export class SessionError extends DomainError {
  constructor(
    message: string,
    public readonly sessionId?: string,
    public readonly userId?: string,
    public readonly reason?: string,
  ) {
    super(`Session error: ${message}`);
    this.name = 'SessionError';
  }
}
