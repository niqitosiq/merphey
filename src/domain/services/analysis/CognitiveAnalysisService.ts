import { TherapeuticPlan } from '../../aggregates/therapy/entities/TherapeuticPlan';
import { LLMAdapter } from '../../../infrastructure/llm/openai/LLMAdapter';
import { Message } from 'src/domain/aggregates/conversation/entities/Message';
import { UserMessage } from 'src/domain/aggregates/conversation/entities/types';
import { Goal } from 'src/domain/aggregates/therapy/entities/PlanVersion';

export interface AnalysisResult {
  shouldBeRevised: boolean;
  nextGoal?: Goal['codename'];
  language: string;
}

/**
 * Domain service for analyzing user messages in therapeutic context
 * Provides deep cognitive and emotional analysis of user communications
 */
export class ContextAnalyzer {
  constructor(private llmService: LLMAdapter) {}

  /**
   * Performs deep analysis of user message within conversation context
   * @param message - Current user message
   * @param plan - Current therapeutic plan
   * @param history - Previous conversation history
   * @returns Analysis - Cognitive and emotional insights from the message
   */

  async analyzeMessage(
    message: Message,
    plan: TherapeuticPlan | null,
    history: UserMessage[],
  ): Promise<AnalysisResult> {
    const prompt = this.constructAnalysisPrompt(message, plan, history);
    console.log(prompt);
    const response = await this.llmService.generateCompletion(prompt, {
      model: 'google/gemini-2.0-flash-001',
    });

    try {
      return this.parseAnalysisResponse(response);
    } catch (error: any) {
      throw new Error(`Failed to parse analysis response: ${error.message}`);
    }
  }

  /**
   * Constructs a comprehensive prompt for message analysis
   * Includes user context, therapeutic goals, and history
   */
  private constructAnalysisPrompt(
    message: Message,
    plan: TherapeuticPlan | null,
    history?: UserMessage[],
  ): string {
    console.log('Analyzing message:', message.content);

    // Process recent conversation history with roles preserved
    const recentHistory = history
      ?.slice(-15)
      .map((m) => `[${m.role}]: ${m.content}`)
      .join('\n');

    // Extract plan content details
    const planContent = plan?.currentVersion?.getContent();

    // Format goals with their state and approach
    const goals = planContent?.goals
      ? planContent.goals
          .map(
            (g) =>
              `[${g.state}]: ${g.content}\nApproach: ${g.approach}; Identifier: "${g.codename}"`,
          )
          .join('\n\n')
      : 'No current goals';

    // Extract techniques and other plan elements
    const techniques = planContent?.techniques?.join(', ') || 'No specific techniques';
    const approach = planContent?.approach || 'No general approach defined';
    const focus = planContent?.focus || 'No specific focus area';

    // Extract user insights from message metadata
    const userInsights =
      history
        ?.filter((msg) => msg.metadata?.breakthrough || msg.metadata?.challenge)
        .map((msg) => `- ${msg.metadata?.breakthrough || msg.metadata?.challenge}`)
        .join('\n') || 'No specific insights recorded yet';

    return `**THERAPEUTIC MESSAGE ANALYSIS REQUEST**

**Message to Analyze:** "${message.content}"

**Conversation Context:**  
${recentHistory || 'No conversation history available'}

**User Insights:**  
${userInsights}

**Therapeutic Plan Context:**  
- Focus Area: ${focus}  
- General Approach: ${approach}  
- Techniques: ${techniques}

**Current Goals:**  
${goals}

**Analysis Tasks:**  
1. Has the user achieved any of the current goals based on their message?  
2. Has the user's context changed significantly, requiring a plan revision?  
3. What should be the next goal to focus on?  
4. What language is the user speaking?  
5. Should the therapeutic plan be revised?

**The plan should be revised if:**  
- The user provides significant new information.  
- The user expresses dissatisfaction with the current approach.  
- The user's emotional state has changed dramatically.  
- The current goals are no longer appropriate.

**Instructions for Response:**  
Return ONLY valid JSON in the following format without any additional text:

{
  "nextGoal": "meaningful_identifier",
  "language": "detected language code or name",
  "shouldBeRevised": true/false,
  "reason": "Brief explanation"
}`;
  }

  private parseAnalysisResponse(response: string): AnalysisResult {
    try {
      const parsed = JSON.parse(response);
      this.validateAnalysisStructure(parsed);
      return parsed;
    } catch (error: any) {
      throw new Error(`Invalid analysis format: ${error.message}`);
    }
  }

  private validateAnalysisStructure(analysis: any): void {
    const requiredFields = [
      'emotionalThemes',
      'cognitivePatternsIdentified',
      'therapeuticProgress',
      'engagementMetrics',
      'therapeuticOpportunities',
      'shouldBeRevised',
    ];

    // for (const field of requiredFields) {
    //   if (!analysis[field]) {
    //     throw new Error(`Missing required field: ${field}`);
    //   }
    // }

    // if (
    //   typeof analysis.emotionalThemes.intensity !== 'number' ||
    //   analysis.emotionalThemes.intensity < 0 ||
    //   analysis.emotionalThemes.intensity > 1
    // ) {
    //   throw new Error('Invalid emotional intensity value');
    // }

    // if (!Array.isArray(analysis.cognitivePatternsIdentified)) {
    //   throw new Error('Cognitive patterns must be an array');
    // }
  }
}
