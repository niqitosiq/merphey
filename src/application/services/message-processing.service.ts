/**
 * MessageProcessingService - Coordinates domain services to process user messages
 * Ensures all message handling is powered by LLM
 */

import { UserAggregate } from '../../domain/user-interaction/aggregates/user.aggregate';
import { RiskAssessor } from '../../domain/risk-management/services/risk-assessment.service';
import { ContextMonitor } from '../../domain/context-analysis/services/context-monitor.service';
import { TherapeuticPlanAggregate } from '../../domain/plan-management/aggregates/therapeutic-plan.aggregate';
import { ConversationState } from '../../domain/user-interaction/value-objects/conversation-state.value-object';
import { LLMGateway, ModelTier } from '../../infrastructure/llm-integration/llm-gateway.adapter';
import { RiskLevel } from '../../domain/risk-management/value-objects/risk-level.value-object';
import { TelegramMessage } from '../../infrastructure/telegram/telegram-types';
import { User } from '../../domain/user-interaction/entities/user.entity';
import { TelegramResponse } from '../../infrastructure/telegram/telegram-types';

export interface MessageProcessingService {
  processMessage(message: TelegramMessage, user: User): Promise<TelegramResponse>;
}

export interface ProcessedResponse {
  text: string;
  triggerAction?: string;
  riskLevel?: string;
  planChanged?: boolean;
}

export class MessageProcessor {
  constructor(
    private riskAssessor: RiskAssessor,
    private contextMonitor: ContextMonitor,
    private llmGateway: LLMGateway,
  ) {}

  /**
   * Process an incoming message and generate a response using LLM
   */
  async processMessage(
    message: TelegramMessage,
    userAggregate: UserAggregate,
    currentPlan: TherapeuticPlanAggregate,
  ): Promise<ProcessedResponse> {
    // 1. Add the new message to user's history
    userAggregate.addMessage(message.text, 'USER');

    // 2. Analyze risk level using LLM
    const riskSpectrum = await this.riskAssessor.detectEscalationPatterns(
      userAggregate.getMessageHistory(),
    );

    // 3. Update user's risk profile
    userAggregate.updateRiskProfile(riskSpectrum);

    // 4. Check for context shifts using LLM
    const contextDelta = await this.contextMonitor.detectContextShift(
      currentPlan.getPlan(),
      userAggregate.getMessageHistory(),
    );

    // 5. Generate response using LLM
    const response = await this.generateLLMResponse(
      message.text,
      userAggregate,
      currentPlan,
      riskSpectrum.level,
      contextDelta,
    );

    // 6. Add bot response to history
    userAggregate.addMessage(response.text, 'BOT');

    // 7. Handle plan revisions if context shift detected
    let planChanged = false;
    if (contextDelta.requiresPlanRevision) {
      const newPlan = await this.revisePlanWithLLM(userAggregate, currentPlan, contextDelta);

      userAggregate.updatePlanVersion(newPlan.getPlan().version);
      planChanged = true;
    }

    return {
      text: response.text,
      triggerAction: response.triggerAction,
      riskLevel: riskSpectrum.level,
      planChanged,
    };
  }

  /**
   * Generate therapeutic response using LLM
   * @private
   */
  private async generateLLMResponse(
    userMessage: string,
    userAggregate: UserAggregate,
    plan: TherapeuticPlanAggregate,
    riskLevel: string,
    contextDelta: any,
  ): Promise<{ text: string; triggerAction?: string }> {
    const user = userAggregate.getUser();

    // Handle critical risk situations
    if (riskLevel === RiskLevel.CRITICAL) {
      const emergencyResponse = await this.riskAssessor.executeEmergencyProtocol(user);
      return {
        text: emergencyResponse.recommendedAction,
        triggerAction: 'ESCALATE_TO_CRISIS_SUPPORT',
      };
    }

    // Get relevant context for LLM response generation
    const messageHistory = userAggregate.getMessageHistory();
    const recentMessages = messageHistory.messages
      .slice(-10)
      .map((m) => `${m.sender === 'USER' ? 'User' : 'Bot'}: ${m.content}`)
      .join('\n');

    // Get current plan information
    const nextStep = plan.getNextRecommendedStep();

    // Create a prompt based on current conversation state
    let prompt = '';
    let systemPrompt = '';
    let triggerAction = '';

    // Adapt prompt based on conversation state
    switch (user.conversationState) {
      case ConversationState.INITIAL:
        systemPrompt =
          'You are a therapeutic assistant greeting a new user for the first time. Be warm, welcoming and conversational. Aim to understand their concerns.';
        prompt = `
Generate an initial greeting for a user of a therapeutic conversation bot. Make the user feel comfortable sharing their concerns.
Recent message from user: "${userMessage}"
        `;
        triggerAction = 'TRANSITION_TO_ASSESSMENT';
        break;

      case ConversationState.ASSESSMENT:
        systemPrompt =
          "You are a therapeutic assistant conducting an initial assessment. Ask open-ended questions to understand the user's situation and needs.";
        prompt = `
Conduct an initial assessment with the user. Ask exploratory questions and respond empathetically to their concerns.
Conversation context:
${recentMessages}

Response should continue the assessment while being supportive and conversational.
        `;
        triggerAction = nextStep ? 'TRANSITION_TO_INTERVENTION' : 'CONTINUE_ASSESSMENT';
        break;

      case ConversationState.INTERVENTION:
        systemPrompt =
          'You are a therapeutic assistant providing evidence-based therapeutic support based on a specific intervention plan.';
        prompt = `
Provide therapeutic guidance based on the current plan:
${nextStep ? `Current focus: ${nextStep.title} - ${nextStep.description}` : 'No specific step defined'}

Context: ${contextDelta.detectedTheme ? `The conversation is about ${contextDelta.detectedTheme}` : 'Following the therapeutic plan'}

Recent conversation:
${recentMessages}

Respond in a therapeutic, supportive manner that aligns with the current focus.
        `;
        triggerAction = contextDelta.requiresPlanRevision ? 'UPDATE_PLAN' : 'CONTINUE_INTERVENTION';
        break;

      case ConversationState.REFLECTION:
        systemPrompt =
          'You are a therapeutic assistant helping the user reflect on their progress and insights.';
        prompt = `
Help the user reflect on their therapeutic journey. Summarize key insights and progress.

Conversation history:
${recentMessages}

Guide the user to identify what's been most helpful and what they've learned.
        `;
        triggerAction = 'PREPARE_FOR_CLOSURE';
        break;

      case ConversationState.CLOSURE:
        systemPrompt =
          'You are a therapeutic assistant bringing a session to a gentle close with summary and next steps.';
        prompt = `
Bring the therapeutic conversation to a supportive close. Summarize key takeaways and provide encouragement.

Conversation history:
${recentMessages}

Include gentle reminders about implementing what was discussed.
        `;
        triggerAction = 'COMPLETE_SESSION';
        break;

      default:
        systemPrompt = 'You are a therapeutic assistant responding to a user in need of support.';
        prompt = `
Respond to the user's message in a therapeutic, supportive manner.

Recent message: "${userMessage}"
Recent conversation context:
${recentMessages}
        `;
        break;
    }

    // Include risk level in system prompt if elevated
    if (riskLevel === RiskLevel.HIGH || riskLevel === RiskLevel.MODERATE) {
      systemPrompt += ` The user shows ${riskLevel.toLowerCase()} risk indicators. Be especially supportive and attentive.`;
    }

    // Generate response with LLM
    try {
      // Use higher tier model for user-facing responses
      const llmResponse = await this.llmGateway.generateResponse({
        prompt,
        systemPrompt,
        modelTier: ModelTier.HIGH,
        temperature: 0.7, // Higher temperature for more varied, humanlike responses
      });

      return {
        text: llmResponse.content,
        triggerAction,
      };
    } catch (error) {
      console.error('Error generating therapeutic response:', error);

      // Fallback response
      return {
        text: "I'm here to support you. Could you tell me more about what's on your mind?",
        triggerAction,
      };
    }
  }

  /**
   * Use LLM to revise the therapeutic plan based on context shift
   * @private
   */
  private async revisePlanWithLLM(
    userAggregate: UserAggregate,
    currentPlan: TherapeuticPlanAggregate,
    contextDelta: any,
  ): Promise<TherapeuticPlanAggregate> {
    // Create a new version of the plan
    const newPlan = currentPlan.createNewVersion();
    const planData = newPlan.getPlan();

    // Get recent conversation for context
    const messageHistory = userAggregate.getMessageHistory();
    const recentMessages = messageHistory.messages
      .slice(-10)
      .map((m) => `${m.sender === 'USER' ? 'User' : 'Bot'}: ${m.content}`)
      .join('\n');

    // Generate new therapeutic focus using LLM
    const prompt = `
Based on a shift in conversation context, revise a therapeutic plan for a user.

DETECTED CONTEXT SHIFT:
- New theme: ${contextDelta.detectedTheme || 'Undefined'}
- Key concepts: ${contextDelta.significantKeywords.join(', ') || 'None identified'}

ORIGINAL PLAN TARGET OUTCOMES:
${planData.targetOutcomes.map((outcome) => `- ${outcome}`).join('\n')}

RECENT CONVERSATION:
${recentMessages}

Provide 2-3 new target outcomes that address the shifted conversation focus while still being therapeutic.
Format your response as:
NEW_TARGET_OUTCOMES:
- [outcome 1]
- [outcome 2]
- [outcome 3]
`;

    try {
      const llmResponse = await this.llmGateway.generateResponse({
        prompt,
        systemPrompt:
          'You are a clinical therapeutic planning assistant that adapts therapeutic plans based on changing client needs.',
        modelTier: ModelTier.HIGH,
        temperature: 0.4,
      });

      // Parse the LLM response to extract new outcomes
      const responseText = llmResponse.content;
      const outcomesRegex = /NEW_TARGET_OUTCOMES:\s*((?:- .*\n?)+)/;
      const match = responseText.match(outcomesRegex);

      if (match) {
        const outcomesText = match[1];
        const outcomes = outcomesText
          .split('\n')
          .filter((line) => line.trim().startsWith('-'))
          .map((line) => line.replace('-', '').trim())
          .filter((outcome) => outcome.length > 0);

        // Update the plan with new outcomes
        if (outcomes.length > 0) {
          planData.targetOutcomes = outcomes;

          // In a full implementation, we would also generate new steps based on the outcomes
          // For now, we'll keep the existing steps but update their relevance
        }
      }

      return newPlan;
    } catch (error) {
      console.error('Error revising therapeutic plan:', error);
      return newPlan; // Return unmodified new plan version
    }
  }
}
