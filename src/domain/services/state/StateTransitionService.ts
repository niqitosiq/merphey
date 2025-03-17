import { ConversationState, RiskLevel } from '../../shared/enums';
import { LLMAdapter } from '../../../infrastructure/llm/openai/LLMAdapter';
import { TransitionValidator } from './TransitionValidator';
import { ConversationContext, StateTransition } from '../../aggregates/conversation/entities/types';
import { AnalysisResult } from '../analysis/CognitiveAnalysisService';

interface TransitionAnalysis {
  suggestedState: ConversationState;
  reasoning: string;
  confidence: number;
}

export class StateTransitionService {
  constructor(
    private llmService: LLMAdapter,
    private transitionValidator: TransitionValidator,
  ) {}

  async determineTransition(
    context: ConversationContext,
    analysis: AnalysisResult,
  ): Promise<StateTransition> {
    // 1. Immediate emergency handling
    if (this.requiresEmergencyTransition(context)) {
      return this.emergencyTransition(context);
    }

    const newState: ConversationState =
      context.therapeuticPlan.currentVersion?.content.goals?.find(
        (g) => g.codename === analysis.nextGoal,
      )?.state || context.currentState;

    // 2. LLM-based state analysis
    // const analysis = await this.analyzeWithLLM(context);

    // 3. Validate transition possibility
    this.validateTransition(context.currentState, newState);

    return {
      from: context.currentState,
      to: newState,
    };
  }

  private async analyzeWithLLM(context: ConversationContext): Promise<TransitionAnalysis> {
    const prompt = this.createAnalysisPrompt(context);
    const response = await this.llmService.generateCompletion(prompt, {
      model: 'google/gemini-2.0-flash-001',
    });

    return this.parseLLMResponse(response);
  }

  private createAnalysisPrompt(context: ConversationContext): string {
    const planContent = context.therapeuticPlan?.currentVersion?.getContent();
    return `Analyze this therapeutic conversation and recommend next state. 
Context:
- Current State: ${context.currentState}
- Risk Level: ${context.riskHistory[context.riskHistory.length - 1]?.level ?? 'UNKNOWN'}
- Recent Messages: ${context.history
      .slice(-5)
      .map((m) => m.content)
      .join('\n')}
- Current Plan: ${planContent ? `Goals: ${planContent.goals?.join(', ')}` : 'No plan'}

Consider these state transition rules:
${this.getStateTransitionRules()}

Respond ONLY in JSON format: 
{
  "suggestedState": "VALID_STATE_NAME",
  "reasoning": "string",
  "confidence": 0.0-1.0
}`;
  }

  private parseLLMResponse(response: string): TransitionAnalysis {
    try {
      const result = JSON.parse(response);
      return {
        suggestedState: this.validateState(result.suggestedState),
        reasoning: result.reasoning,
        confidence: result.confidence,
      };
    } catch (e) {
      throw new Error('Invalid LLM response format');
    }
  }

  private validateState(state: string): ConversationState {
    if (!Object.values(ConversationState).includes(state as ConversationState)) {
      throw new Error(`Invalid state suggested: ${state}`);
    }
    return state as ConversationState;
  }

  private validateTransition(current: ConversationState, next: ConversationState): void {
    if (!this.transitionValidator.validateTransition(current, next)) {
      // throw new Error(`Invalid transition from ${current} to ${next}`);
      console.log(`Invalid transition from ${current} to ${next}`);
    }
  }

  private requiresEmergencyTransition(context: ConversationContext): boolean {
    const latestRisk = context.riskHistory[context.riskHistory.length - 1];
    return (
      latestRisk?.level === RiskLevel.CRITICAL ||
      context.history.some((m) => m.metadata?.containsImmediateRisk)
    );
  }

  private emergencyTransition(context: ConversationContext): StateTransition {
    return {
      from: context.currentState,
      to: ConversationState.EMERGENCY_INTERVENTION,
    };
  }

  private getStateTransitionRules(): string {
    return `1. EMERGENCY_INTERVENTION can transition to SESSION_CLOSING
2. INFO_GATHERING can transition to ACTIVE_GUIDANCE or EMERGENCY_INTERVENTION
3. ACTIVE_GUIDANCE can transition to PLAN_REVISION or SESSION_CLOSING
4. PLAN_REVISION can transition back to ACTIVE_GUIDANCE`;
  }
}
