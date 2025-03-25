/**
 * Event types for the system
 * Contains both event names and payload types
 */

// Event names as constants
export const EventTypes = {
  // Conversation events
  MESSAGE_RECEIVED: 'MESSAGE_RECEIVED',
  MESSAGE_PROCESSED: 'MESSAGE_PROCESSED',

  // Risk assessment events
  RISK_ASSESSED: 'RISK_ASSESSED',
  CRITICAL_RISK_DETECTED: 'CRITICAL_RISK_DETECTED',

  // Therapeutic plan events
  PLAN_CREATED: 'PLAN_CREATED',
  PLAN_UPDATED: 'PLAN_UPDATED',

  // Session events
  SESSION_STARTED: 'SESSION_STARTED',
  SESSION_COMPLETED: 'SESSION_COMPLETED',
  SESSION_EXPIRED: 'SESSION_EXPIRED',
  SESSION_TIME_WARNING: 'SESSION_TIME_WARNING',

  // Payment events
  PAYMENT_CREATED: 'PAYMENT_CREATED',
  PAYMENT_COMPLETED: 'PAYMENT_COMPLETED',
  PAYMENT_FAILED: 'PAYMENT_FAILED',

  ASK_USER_TO_WAIT: 'ASK_USER_TO_WAIT',
  SEND_TYPING: 'SEND_TYPING',
};

// Type for event names
export type EventType = (typeof EventTypes)[keyof typeof EventTypes];

// Payload types for each event
export interface AskUserToWaitEvent {
  userId: string;
  message: string; // Custom message to display while waiting
}

export interface SendTypingEvent {
  userId: string;
  durationMs?: number; // Optional duration for typing indicator
}

export interface MessageReceivedEvent {
  userId: string;
  messageId: string;
  text: string;
  timestamp: Date;
}

export interface MessageProcessedEvent {
  userId: string;
  messageId: string;
  responseId: string;
  processingTimeMs: number;
}

export interface RiskDetectedEvent {
  userId: string;
  messageId: string;
  riskLevel: string;
  triggerPhrases?: string[];
}

export interface PlanUpdatedEvent {
  userId: string;
  oldPlanId?: string;
  newPlanId: string;
  reason: string;
}

export interface StateChangedEvent {
  userId: string;
  oldState: string;
  newState: string;
  reason: string;
}
