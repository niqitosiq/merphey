import { AnalysisResult } from 'src/domain/services/analysis/CognitiveAnalysisService';
import { LLMAdapter } from './LLMAdapter';
import { ConversationState } from '../../../domain/shared/enums';
import { TherapeuticResponse } from '../../../domain/aggregates/conversation/entities/types';

/**
 * Infrastructure service for generating therapeutic responses using OpenAI
 * Responsible for creating appropriate therapeutic responses based on conversation context
 */
export class GptResponseGenerator {
  constructor(private openai: LLMAdapter) {}

  /**
   * Generates a therapeutic response based on conversation context
   * @param currentState - Current conversation state
   * @param analysis - Analysis of user message
   * @param userLanguage - ISO language code for the user's preferred language
   * @returns TherapeuticResponse - Contains response content and insights
   */
  async generateTherapeuticResponse(
    currentState: ConversationState,
    analysis: AnalysisResult,
  ): Promise<TherapeuticResponse> {
    try {
      // Build context-aware prompt that includes language instructions
      const prompt = this.buildTherapeuticPrompt(currentState, analysis, analysis.language);

      // Generate response with specific parameters for therapeutic context
      const completion = await this.openai.generateCompletion(prompt, {
        temperature: 0.9,
        maxTokens: 3000,
        presencePenalty: 0.6, // Encourage diverse responses
        frequencyPenalty: 0.2, // Reduce repetition
        model: 'google/gemini-2.0-flash-exp:free',
      });

      // Parse the response and return structured therapeutic response
      return this.parseResponse(completion, currentState);
    } catch (error) {
      console.error('Error generating therapeutic response:', error);
      // Provide a safe fallback response in case of errors
      return this.getFallbackResponse(currentState);
    }
  }

  /**
   * Parses the LLM response into structured TherapeuticResponse format
   */
  private parseResponse(response: string, state: ConversationState): TherapeuticResponse {
    try {
      // Extract JSON from the response (handles cases where LLM adds extra text)
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      const jsonStr = jsonMatch ? jsonMatch[0] : response;

      // Parse the JSON string into an object
      const parsedResponse = JSON.parse(jsonStr);

      // Validate and extract required fields with fallbacks
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
      // If parsing fails, return fallback response
      return this.getFallbackResponse(state);
    }
  }

  /**
   * Constructs a comprehensive prompt for therapeutic response generation
   * @param currentState - Current conversation state
   * @param analysis - Analysis of user message
   * @param userLanguage - The language to generate the response in
   */
  private buildTherapeuticPrompt(
    currentState: ConversationState,
    analysis: AnalysisResult,
    userLanguage: string = 'en',
  ): string {
    // Create language instruction based on user language
    const languageInstruction =
      userLanguage !== 'english'
        ? `IMPORTANT: Only the "content" field should be in ${userLanguage} language as it will be shown directly to the user. All other fields (insights, suggestedTechniques, etc.) must remain in English for internal processing.`
        : '';

    return `You are PsychoBot, an advanced therapeutic AI assistant trained in evidence-based psychological approaches. You're having a conversation with a person seeking mental health support.

${languageInstruction}

CURRENT CONVERSATION STATE: ${currentState}

USER ANALYSIS:
- Primary emotional theme: ${analysis.emotionalThemes.primary || 'Not identified'}
- Secondary emotional theme: ${analysis.emotionalThemes.secondary || 'Not identified'}
- Emotional intensity: ${analysis.emotionalThemes.intensity || 'Moderate'}
- Engagement level: Coherence (${analysis.engagementMetrics?.coherence || 'medium'}), Openness (${analysis.engagementMetrics?.openness || 'medium'}), Resistance (${analysis.engagementMetrics?.resistanceLevel || 'low'})
- Identified challenges: ${analysis.therapeuticProgress?.identifiedSetbacks?.join(', ') || 'None identified'}
- Recent improvements: ${analysis.therapeuticProgress?.improvements?.join(', ') || 'None identified'}
- Therapeutic opportunities: ${analysis.therapeuticOpportunities?.join(', ') || 'Continue building rapport'}

THERAPEUTIC GUIDELINES:
${this.getStateSpecificGuidelines(currentState)}

RESPONSE INSTRUCTIONS:
1. Respond with empathy and authenticity
2. Use evidence-based therapeutic techniques appropriate for the conversation state
3. Match your tone to the user's emotional state while maintaining a calming presence
4. Focus on the most relevant therapeutic opportunity identified in the analysis
5. Avoid giving direct advice; instead, help the person explore their own solutions
6. Keep responses concise (2-4 sentences) and conversational
7. The "content" field must be in ${userLanguage === 'en' ? 'English' : userLanguage} language as it will be shown to the user
8. All other fields (insights, suggestedTechniques, etc.) must remain in English
9. Use emoji when it is applicable

Your response should be formatted as JSON:
{
  "content": "Your therapeutic response here in ${userLanguage === 'en' ? 'English' : userLanguage} language - THIS IS THE ONLY FIELD THAT SHOULD BE IN THE USER'S LANGUAGE",
  "insights": {
    "positiveProgress": "Brief description of positive aspects you noticed (in English)",
    "techniqueAdoption": "Specific technique you're employing and why (in English)",
    "challenges": ["Ongoing challenge 1 (in English)", "Potential obstacle 2 (in English)"]
  },
  "suggestedTechniques": ["technique1", "technique2"]
}`;
  }

  /**
   * Provides state-specific therapeutic guidelines based on the conversation state
   */
  private getStateSpecificGuidelines(state: ConversationState): string {
    switch (state) {
      case ConversationState.INFO_GATHERING:
        return `
- Use open-ended questions to encourage sharing
- Practice reflective listening to validate experiences
- Focus on building rapport and psychological safety
- Look for themes in the person's narrative
- Avoid interpretation too early in the conversation`;

      case ConversationState.ACTIVE_GUIDANCE:
        return `
- Apply cognitive reframing for negative thought patterns
- Suggest mindfulness techniques when appropriate
- Help identify connections between thoughts, feelings, and behaviors
- Validate emotions while gently challenging cognitive distortions
- Emphasize the person's strengths and past successes`;

      case ConversationState.PLAN_REVISION:
        return `
- Refer to previously identified goals and progress
- Highlight specific improvements you've noticed
- Collaboratively explore adjustments to coping strategies
- Focus on practical, achievable next steps
- Reinforce positive behavior changes`;

      case ConversationState.EMERGENCY_INTERVENTION:
        return `
- Prioritize safety and immediate emotional stabilization
- Use grounding techniques to help manage overwhelming emotions
- Be directive but gentle in your approach
- Focus on the present moment rather than past or future concerns
- Provide clear, concrete support options`;

      case ConversationState.SESSION_CLOSING:
        return `
- Summarize key insights from the conversation
- Reinforce positive steps and learnings
- Suggest a simple practice or reflection until next interaction
- Leave the conversation on a hopeful, forward-looking note
- Acknowledge the person's effort and courage`;

      default:
        return `
- Focus on empathetic listening and validation
- Maintain a supportive, non-judgmental presence
- Look for opportunities to deepen understanding
- Prioritize building trust and therapeutic alliance`;
    }
  }

  /**
   * Provides a safe fallback response when normal generation fails
   * @param state - Current conversation state
   * @param language - ISO language code for the user's preferred language
   */
  private getFallbackResponse(state: ConversationState): TherapeuticResponse {
    // Default English fallback responses
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

    let content =
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
