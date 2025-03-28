import {
  ConversationContext,
  TherapeuticResponse,
} from '../../aggregates/conversation/entities/types';
import { LLMAdapter } from '../../../infrastructure/llm/openai/LLMAdapter';
import { Message } from 'src/domain/aggregates/conversation/entities/Message';
import { PlanVersion } from 'src/domain/aggregates/therapy/entities/PlanVersion';
import { AnalysisResult } from './CognitiveAnalysisService';
import { buildTherapeuticPrompt } from './prompts/therapeuticResponse';
import { ConversationState } from '@prisma/client';

/**
 * Domain service for generating therapeutic responses
 * Responsible for creating appropriate therapeutic responses based on conversation context
 */
export class TherapistService {
  constructor(private llmService: LLMAdapter) {}

  /**
   * Generates a therapeutic response based on conversation context
   */
  async generateResponse(
    context: ConversationContext,
    analysis: AnalysisResult,
    plan: PlanVersion | null,
    message: Message,
  ): Promise<TherapeuticResponse> {
    try {
      const prompt = buildTherapeuticPrompt({
        context,
        analysis,
        plan,
        userLanguage: analysis.language,
        message,
      });

      const completion = await this.llmService.generateCompletion(prompt, {
        temperature: 0.5,
        maxTokens: 3000,
        presencePenalty: 0.6,
        frequencyPenalty: 0.2,
        model: 'google/gemini-2.0-flash-001',
      });

      return this.parseResponse(completion, context.currentState);
    } catch (error) {
      console.error('Error generating therapeutic response:', error);
      return this.getFallbackResponse(context.currentState);
    }
  }

  /**
   * Parses the LLM response into structured TherapeuticResponse format
   */
  private parseResponse(response: string, state: ConversationState): TherapeuticResponse {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      const jsonStr = jsonMatch ? jsonMatch[0] : response;
      const parsedResponse = JSON.parse(jsonStr);

      const content =
        parsedResponse.content || "I'm here to support you. Would you like to share more?";

      const insights = {
        positiveProgress:
          parsedResponse.insights?.positiveProgress || 'Continuing to build therapeutic rapport',
        techniqueAdoption:
          parsedResponse.insights?.techniqueAdoption ||
          'Employing active listening to understand your perspective',
        challenges: Array.isArray(parsedResponse.insights?.challenges)
          ? parsedResponse.insights.challenges
          : ['Maintaining focus on the therapeutic process'],
      };

      const suggestedTechniques = Array.isArray(parsedResponse.suggestedTechniques)
        ? parsedResponse.suggestedTechniques
        : ['active_listening', 'validation'];

      return {
        content,
        insights,
        suggestedTechniques,
      };
    } catch (error) {
      console.warn('Failed to parse LLM response:', error);
      return this.getFallbackResponse(state);
    }
  }

  /**
   * Provides a safe fallback response when normal generation fails
   */
  private getFallbackResponse(state: ConversationState): TherapeuticResponse {
    const fallbackContent: Record<ConversationState, string> = {
      [ConversationState.INFO_GATHERING]:
        "I understand you're sharing something important. Could you tell me more about how that affected you?",
      [ConversationState.ACTIVE_GUIDANCE]:
        "I hear what you're saying. Let's take a moment to reflect on this together. How do you feel about this situation now?",
      [ConversationState.PLAN_REVISION]:
        "Your progress is important. Let's consider what's been working well and what might need adjustment.",
      [ConversationState.EMERGENCY_INTERVENTION]:
        "I'm here with you right now. Let's focus on what might help you feel safer in this moment.",
      [ConversationState.SESSION_CLOSING]:
        "Thank you for sharing your thoughts today. Would it help to summarize what we've discussed?",
    };

    const content =
      fallbackContent[state] ||
      "I'm here to listen and support you. Would you like to continue our conversation?";

    return {
      content,
      insights: {
        positiveProgress: 'Continuing the therapeutic dialogue',
        techniqueAdoption: 'Maintaining therapeutic presence',
        challenges: ['System encountered technical limitations'],
      },
      suggestedTechniques: ['active_listening', 'validation'],
    };
  }
}
