/**
 * ConversationState Value Object - Represents the current state of a user conversation
 */

export enum ConversationState {
  INITIAL = 'INITIAL',
  ASSESSMENT = 'ASSESSMENT',
  INTERVENTION = 'INTERVENTION',
  REFLECTION = 'REFLECTION',
  CLOSURE = 'CLOSURE',
}

export interface ConversationStateData {
  state: ConversationState;
  contextData: Record<string, any>; // Specific data relevant to the current state
  enteredAt: Date;
  previousState?: ConversationState;
}
