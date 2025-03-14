import {
  ConversationState,
  ConversationContext,
  RiskLevel,
  StateTransition,
  HistoryMessage,
} from '../models/conversation';
import { Logger } from '../../utils/logger';

export class StateManager {
  private static readonly STATE_TRANSITION_RULES: Record<ConversationState, ConversationState[]> = {
    [ConversationState.INITIAL]: [ConversationState.GATHERING_INFO],
    [ConversationState.GATHERING_INFO]: [
      ConversationState.ANALYSIS_NEEDED,
      ConversationState.PENDING_ANALYSIS,
      ConversationState.DEEP_ANALYSIS,
      ConversationState.SESSION_CLOSING,
    ],
    [ConversationState.ANALYSIS_NEEDED]: [
      ConversationState.PENDING_ANALYSIS,
      ConversationState.DEEP_ANALYSIS,
    ],
    [ConversationState.PENDING_ANALYSIS]: [
      ConversationState.GUIDANCE_DELIVERY,
      ConversationState.DEEP_ANALYSIS,
    ],
    [ConversationState.DEEP_ANALYSIS]: [
      ConversationState.GUIDANCE_DELIVERY,
      ConversationState.SESSION_CLOSING,
    ],
    [ConversationState.GUIDANCE_DELIVERY]: [
      ConversationState.GATHERING_INFO,
      ConversationState.PENDING_ANALYSIS, // Added PENDING_ANALYSIS as valid transition
      ConversationState.SESSION_CLOSING,
    ],
    [ConversationState.SESSION_CLOSING]: [],
    [ConversationState.ERROR_RECOVERY]: Object.values(ConversationState),
  };

  private static readonly RISK_STATE_MAPPING: Record<RiskLevel, ConversationState | null> = {
    CRITICAL: ConversationState.DEEP_ANALYSIS,
    HIGH: ConversationState.PENDING_ANALYSIS,
    MEDIUM: null,
    LOW: null,
  };

  private readonly logger = Logger.getInstance();

  attemptStateTransition(
    context: ConversationContext,
    suggestedState: ConversationState,
    reason: string,
    riskLevel: RiskLevel,
  ): StateTransition | null {
    this.logger.debug('Attempting state transition', {
      userId: context.userId,
      currentState: context.state,
      suggestedState,
      reason,
      riskLevel,
    });

    // Check if transition is forced by risk level
    const riskForcedState = StateManager.RISK_STATE_MAPPING[riskLevel];
    const targetState = riskForcedState || suggestedState;

    // Always allow transitions to error recovery or risk-forced states
    const isAllowed =
      targetState === ConversationState.ERROR_RECOVERY ||
      !!riskForcedState ||
      this.isTransitionAllowed(context.state, targetState);

    if (!isAllowed) {
      this.logger.debug('Invalid state transition rejected', {
        userId: context.userId,
        currentState: context.state,
        suggestedState,
      });
      return null;
    }

    const transition: StateTransition = {
      from: context.state,
      to: targetState,
      reason,
      riskLevel,
      forcedByRisk: !!riskForcedState,
    };

    this.logger.info('State transition approved', {
      userId: context.userId,
      ...transition,
    });

    // Update context state
    context.state = targetState;
    context.riskLevel = riskLevel;

    return transition;
  }

  private isTransitionAllowed(fromState: ConversationState, toState: ConversationState): boolean {
    return StateManager.STATE_TRANSITION_RULES[fromState].includes(toState);
  }

  private isUserActionAllowed(state: ConversationState): boolean {
    return (
      state !== ConversationState.PENDING_ANALYSIS && state !== ConversationState.DEEP_ANALYSIS
    );
  }

  assessRiskLevel(
    currentRisk: RiskLevel,
    messages: HistoryMessage[],
    suggestedRisk?: RiskLevel,
  ): RiskLevel {
    this.logger.debug('Assessing risk level', {
      currentRisk,
      suggestedRisk,
      historyLength: messages.length,
    });

    // Get recent messages for analysis
    const recentMessages = messages.slice(-5);

    // Count risk factors from recent messages
    const riskFactorsCount = recentMessages.reduce(
      (count, msg) => count + (msg.metadata?.riskFactors?.length || 0),
      0,
    );

    // Check for critical keywords in recent messages
    const criticalKeywords = ['suicide', 'kill', 'die', 'hurt', 'emergency'];
    const hasCriticalContent = recentMessages.some((msg) =>
      criticalKeywords.some((keyword) => msg.text.toLowerCase().includes(keyword)),
    );

    // Risk escalation logic
    if (hasCriticalContent) {
      return 'CRITICAL';
    }

    if (riskFactorsCount >= 3) {
      return 'HIGH';
    }

    // Consider suggested risk level but don't decrease more than one level
    if (suggestedRisk) {
      const riskLevels: RiskLevel[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
      const currentIndex = riskLevels.indexOf(currentRisk);
      const suggestedIndex = riskLevels.indexOf(suggestedRisk);

      // Don't decrease risk more than one level at a time
      if (suggestedIndex < currentIndex - 1) {
        return riskLevels[currentIndex - 1];
      }

      return suggestedRisk;
    }

    return currentRisk;
  }

  getStateMetrics(context: ConversationContext): {
    averageTimeInState: number;
    stateChanges: number;
    currentStateDuration: number;
  } {
    const stateChanges = context.history.filter((msg) => msg.metadata?.stateTransition).length;

    const currentStateDuration =
      Date.now() -
      (context.history.filter((msg) => msg.metadata?.stateTransition?.to === context.state).pop()
        ?.timestamp || context.sessionStartTime);

    const totalSessionDuration = Date.now() - context.sessionStartTime;
    const averageTimeInState = totalSessionDuration / (stateChanges + 1);

    return {
      averageTimeInState,
      stateChanges,
      currentStateDuration,
    };
  }
}
