import {
  BaseConversationState,
  ConversationContext,
  ConversationState,
} from '../value-objects/conversation-state.value-object';

export class AssessmentStateHandler extends BaseConversationState {
  constructor() {
    super();
    this.allowedTransitions = [
      ConversationState.ASSESSMENT,
      ConversationState.REFLECTION,
      ConversationState.INITIAL,
    ];
  }

  async handle(context: ConversationContext): Promise<void> {
    // Assessment state logic - evaluating user needs and current state
  }
}
