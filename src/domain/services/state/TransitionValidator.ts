import { ConversationState } from "@prisma/client";

/**
 * Validates state transitions against allowed state machine paths
 */
export class TransitionValidator {
  // Define allowed state transitions (simplified example)
  private readonly allowedTransitions = new Map<ConversationState, ConversationState[]>([
    [
      ConversationState.INFO_GATHERING,
      [
        ConversationState.ACTIVE_GUIDANCE,
        ConversationState.EMERGENCY_INTERVENTION,
        ConversationState.INFO_GATHERING,
      ],
    ],
    [
      ConversationState.ACTIVE_GUIDANCE,
      [
        ConversationState.ACTIVE_GUIDANCE,
        ConversationState.PLAN_REVISION,
        ConversationState.INFO_GATHERING,
        ConversationState.EMERGENCY_INTERVENTION,
        ConversationState.SESSION_CLOSING,
      ],
    ],
    [
      ConversationState.PLAN_REVISION,
      [
        ConversationState.PLAN_REVISION,
        ConversationState.ACTIVE_GUIDANCE,
        ConversationState.EMERGENCY_INTERVENTION,
      ],
    ],
    [
      ConversationState.EMERGENCY_INTERVENTION,
      [
        ConversationState.EMERGENCY_INTERVENTION,
        ConversationState.INFO_GATHERING,
        ConversationState.SESSION_CLOSING,
      ],
    ],
  ]);

  /**
   * Validates if a state transition is permitted
   */
  validateTransition(currentState: ConversationState, nextState: ConversationState): boolean {
    const allowedStates = this.allowedTransitions.get(currentState) || [];
    return allowedStates.includes(nextState);
  }
}
