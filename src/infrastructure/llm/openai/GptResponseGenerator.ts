import { LlmPort } from '../../../domain/ports/llm.port';
import { ConversationState } from '../../../domain/shared/enums';

interface PromptBuilder {
  buildTherapeuticPrompt(context: {
    state: ConversationState;
    analysis: any;
    transition: any;
  }): Promise<string>;
}

interface ResponseFormatter {
  parseResponse(response: string): Promise<{
    content: string;
    followUp?: string;
    confidence?: number;
  }>;
}

interface TherapeuticResponse {
  content: string;
  techniques: string[];
  suggestedFollowUp?: string;
  metadata: {
    state: ConversationState;
    confidence: number;
    techniquesApplied: string[];
  };
}

/**
 * Infrastructure service for generating therapeutic responses using OpenAI
 * Responsible for creating appropriate therapeutic responses based on conversation context
 */
export class GptResponseGenerator {
  constructor(
    private openai: LlmPort,
    private promptBuilder: PromptBuilder,
    private responseFormatter: ResponseFormatter,
  ) {}

  /**
   * Generates a therapeutic response based on conversation context
   * @param currentState - Current conversation state
   * @param analysis - Analysis of user message
   * @param stateTransition - Any state transition that occurred
   * @returns TherapeuticResponse - Contains response content and metadata
   */
  async generateTherapeuticResponse(
    currentState: ConversationState,
    analysis: any,
    stateTransition: any,
  ): Promise<TherapeuticResponse> {
    try {
      // Build context-aware prompt
      const prompt = await this.promptBuilder.buildTherapeuticPrompt({
        state: currentState,
        analysis,
        transition: stateTransition,
      });

      // Generate response with specific parameters for therapeutic context
      const completion = await this.openai.generateCompletion(prompt, {
        temperature: 0.7,
        maxTokens: 500,
        presencePenalty: 0.6, // Encourage diverse responses
        frequencyPenalty: 0.2, // Reduce repetition
      });

      // Extract structured information from the response
      const structuredResponse = await this.responseFormatter.parseResponse(completion);

      // Analyze response for therapeutic techniques used
      const techniquesAnalysis = await this.openai.analyzeText(
        structuredResponse.content,
        'therapeutic_techniques',
      );

      return {
        content: structuredResponse.content,
        techniques: techniquesAnalysis.techniques || [],
        suggestedFollowUp: structuredResponse.followUp,
        metadata: {
          state: currentState,
          confidence: structuredResponse.confidence || 0.8,
          techniquesApplied: techniquesAnalysis.appliedTechniques || [],
        },
      };
    } catch (error) {
      // Provide a safe fallback response in case of errors
      return this.getFallbackResponse(currentState);
    }
  }

  /**
   * Provides a safe fallback response when normal generation fails
   * @param state - Current conversation state
   * @returns TherapeuticResponse - Safe fallback response
   */
  private getFallbackResponse(state: ConversationState): TherapeuticResponse {
    const fallbacks: Record<ConversationState, string> = {
      [ConversationState.INFO_GATHERING]:
        "I understand you're sharing something important. Could you tell me more about that?",
      [ConversationState.ACTIVE_GUIDANCE]:
        "I hear you. Let's take a moment to reflect on this together.",
      [ConversationState.PLAN_REVISION]:
        "Your progress is important. Should we review what's working well for you?",
      [ConversationState.EMERGENCY_INTERVENTION]:
        "I want to make sure you're safe. Would it be helpful to talk about some immediate coping strategies?",
      [ConversationState.SESSION_CLOSING]:
        "Thank you for sharing. Would you like to summarize what we've discussed?",
    };

    return {
      content:
        fallbacks[state] || "I'm here to listen and support you. Would you like to continue?",
      techniques: ['active_listening', 'safe_space_maintenance'],
      metadata: {
        state,
        confidence: 1.0,
        techniquesApplied: ['fallback_safety'],
      },
    };
  }
}
