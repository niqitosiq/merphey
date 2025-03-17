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
      model: 'google/gemma-3-27b-it',
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

    return `THERAPEUTIC MESSAGE ANALYSIS REQUEST

MESSAGE TO ANALYZE: "${message.content}"

CONVERSATION CONTEXT:
${recentHistory || 'No conversation history available'}

USER INSIGHTS:
${userInsights}

THERAPEUTIC PLAN CONTEXT:
- Focus Area: ${focus}
- General Approach: ${approach}
- Techniques: ${techniques}

CURRENT GOALS:
${goals}
 
ANALYSIS TASKS:
1. Evaluate if any current goals have been reached based on the message
2. Determine if the user's context has changed significantly, making the current plan incorrect
3. Identify the most appropriate goal to focus on next
  - It can be the same goal, if you think that it isn't reached
  - Validate that this goal exists in the goals list
4. Detect the language used by the user
5. Determine if the therapeutic plan should be revised (shouldBeRevised) based on the following conditions:
  - User reveals significant new information not accounted for in the current plan
  - User expresses dissatisfaction with the current approach or techniques
  - User demonstrates substantial progress that warrants advancing to more complex goals
  - User shows resistance to the current therapeutic direction
  - User mentions new symptoms, challenges, or life events that affect treatment priorities
  - User's emotional state has changed dramatically (e.g., from stable to distressed)
  - User explicitly requests a different approach or focus area
  - Current goals appear to be inappropriate or ineffective based on user's responses
  - User demonstrates cognitive or behavioral patterns that conflict with the current plan
  - Therapeutic rapport seems to be deteriorating under the current approach
  - The goal isn't applicable to current discussion
  - You fill that user can't proceed with current goal

INSTRUCTIONS FOR RESPONSE:
Return ONLY valid JSON in the following format without any additional text:

{
  "shouldBeRevised": true/false,  // Set true if any of the revision conditions are met
  "nextGoal": "meaningful_identifier", // The identifier of the next step
  "language": "detected language code or name",
  "reason": "Brief explanation of why the plan should/should not be revised"
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
