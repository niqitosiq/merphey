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

export interface IConversationStateHandler {
  handle(context: ConversationContext): Promise<void>;
  canTransitionTo(newState: ConversationState): boolean;
}

export interface ConversationContext {
  userId: string;
  lastMessageContent: string;
  messageHistory: string[];
  currentPlan?: any;
}

export abstract class BaseConversationState implements IConversationStateHandler {
  protected allowedTransitions: ConversationState[] = [];

  abstract handle(context: ConversationContext): Promise<void>;

  canTransitionTo(newState: ConversationState): boolean {
    return this.allowedTransitions.includes(newState);
  }
}

export class ConversationStateMachine {
  private currentState: IConversationStateHandler;
  private states: Map<ConversationState, IConversationStateHandler>;

  constructor(initialState: IConversationStateHandler) {
    this.currentState = initialState;
    this.states = new Map();
  }

  registerState(type: ConversationState, state: IConversationStateHandler): void {
    this.states.set(type, state);
  }

  async transitionTo(stateType: ConversationState, context: ConversationContext): Promise<boolean> {
    const newState = this.states.get(stateType);

    if (!newState) {
      throw new Error(`State ${stateType} not registered`);
    }

    if (!this.currentState.canTransitionTo(stateType)) {
      return false;
    }

    this.currentState = newState;
    await this.currentState.handle(context);
    return true;
  }

  getCurrentStateType(): ConversationState {
    for (const [type, state] of this.states.entries()) {
      if (state === this.currentState) {
        return type;
      }
    }
    throw new Error('Current state not found in registered states');
  }
}
