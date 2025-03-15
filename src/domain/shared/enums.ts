import { ConversationState, RiskLevel } from '@prisma/client';

export { ConversationState, RiskLevel };

/**
 * Message role types for conversation messages
 */
export enum MessageRole {
  USER = 'user',
  ASSISTANT = 'assistant',
}
