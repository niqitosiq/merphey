import {
  BaseConversationState,
  ConversationContext,
  ConversationState,
} from '../value-objects/conversation-state.value-object';

export class TherapyStateHandler extends BaseConversationState {
  constructor() {
    super();
    this.allowedTransitions = [
      ConversationState.REVIEW,
      ConversationState.CRISIS,
      ConversationState.ASSESSMENT,
    ];
  }

  async handle(context: ConversationContext): Promise<void> {
    // Therapy session logic - implementing therapeutic interventions based on the plan
  }
}
