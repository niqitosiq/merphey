import {
  BaseConversationState,
  ConversationContext,
  ConversationState,
} from '../value-objects/conversation-state.value-object';

export class InitialStateHandler extends BaseConversationState {
  constructor() {
    super();
    this.allowedTransitions = [ConversationState.ASSESSMENT, ConversationState.CRISIS];
  }

  async handle(context: ConversationContext): Promise<void> {
    // Initial state logic - could include welcome message, initial assessment, etc.
  }
}
