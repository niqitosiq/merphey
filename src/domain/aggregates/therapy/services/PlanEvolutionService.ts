import { LLMAdapter } from 'src/infrastructure/llm/openai/LLMAdapter';
import { TherapeuticPlanRepository } from 'src/infrastructure/persistence/postgres/PlanRepository';
import { ConversationContext } from '../../conversation/entities/types';
import { TherapeuticPlan } from '../entities/TherapeuticPlan';
import { PlanContent, PlanVersion } from '../entities/PlanVersion';
import { randomUUID } from 'crypto';
import { AnalysisResult } from 'src/domain/services/analysis/CognitiveAnalysisService';
import { ConversationState } from '@prisma/client';
import { Message } from '../../conversation/entities/Message';

interface PlanValidationResult {
  isValid: boolean;
  errors: string[];
}

export class PlanEvolutionService {
  private readonly CONTEXT_SIMILARITY_THRESHOLD = 0.7;
  private readonly MAX_HISTORY_DEPTH = 20;

  constructor(
    private readonly planRepository: TherapeuticPlanRepository,
    private readonly llmGateway: LLMAdapter,
  ) {}

  generateInitialPlan(): PlanContent {
    return {
      goals: [
        {
          codename: 'starting',
          state: 'INFO_GATHERING',
          content: 'greet user, get to know the person better',
          approach: 'establish contact, find out why user came',
        },
      ],
      approach: 'open-ended questions',
      techniques: ['active listening', 'empathy'],
    };
  }

  async createInitialPlan(currentPlan: TherapeuticPlan) {
    const initialContent = this.generateInitialPlan();

    return new PlanVersion(randomUUID(), currentPlan.id, null, initialContent, null, 1, new Date());
  }

  async revisePlan(
    existingPlan: TherapeuticPlan,
    contextUpdate: ConversationContext,
    message: Message,
  ) {
    if (!existingPlan.currentVersion) {
      throw new Error('Cannot revise plan: no current version exists');
    }

    try {
      const prompt = this.buildRevisionPrompt(existingPlan, message, contextUpdate);
      console.log('prompt revision', prompt);
      const parsedContent = await this.getValidatedPlanContent(prompt);
      const newVersion = existingPlan.createNewVersion(parsedContent);
      return newVersion;
    } catch (error: any) {
      // Rethrow PlanValidationError instances as-is
      if (error instanceof PlanValidationError) {
        throw error;
      }

      // Wrap other errors for better context
      throw new Error(`Failed to revise plan: ${error.message}`);
    }
  }

  /**
   * Builds a comprehensive prompt for plan revision with enhanced context
   * to ensure the LLM has all necessary information to provide appropriate responses
   */
  private buildRevisionPrompt(
    existingPlan: TherapeuticPlan,
    message: Message,
    contextUpdate: ConversationContext,
  ): string {
    // Extract important user information and conversation history
    const recentMessages = contextUpdate.history.slice(-this.MAX_HISTORY_DEPTH);

    const userRiskProfile =
      contextUpdate.riskHistory.length > 0
        ? contextUpdate.riskHistory[contextUpdate.riskHistory.length - 1]
        : 'No risk assessment available';

    // Get current plan data
    const currentGoals = existingPlan.getCurrentGoals() || [];
    const currentTechniques = existingPlan.getRecommendedTechniques() || [];

    // Extract plan content details
    const planContent = existingPlan?.currentVersion?.getContent();

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
    // Build a comprehensive context section
    const userContextSection = `
USER CONTEXT INFORMATION:
- User ID: ${contextUpdate.userId}
- Current Conversation State: ${contextUpdate.currentState}
- Risk Profile: ${JSON.stringify(userRiskProfile)}
- Conversation History:
${recentMessages.map((m) => `[${m.role}]: '${m.content}'`).join('\n')}
[Latest User Message]: '${message.content}'


KEY USER INSIGHTS:
${
  recentMessages
    .filter((msg) => msg.metadata?.breakthrough || msg.metadata?.challenge)
    .map((msg) => `- ${msg.metadata?.breakthrough || msg.metadata?.challenge}`)
    .join('\n') || '- No specific insights recorded yet'
}
`;

    // Build instruction section with clear guidance on response format
    return `THERAPEUTIC PLAN REVISION REQUEST

${userContextSection}

THERAPEUTIC PLAN CONTEXT:
- Focus Area: ${focus}
- General Approach: ${approach}
- Techniques: ${techniques}

CURRENT GOALS:
${goals}

CURRENT GOALS:
${currentGoals.map((goal) => `- [${goal.state}] ${goal.content} (Approach: ${goal.approach})`).join('\n') || 'No goals currently defined'}

CURRENT TECHNIQUES:
${currentTechniques.map((tech) => `- ${tech}`).join('\n') || 'No techniques currently defined'}

INSTRUCTIONS FOR RESPONSE:
1. Analyze the user's history and current state
2. Update the therapeutic plan to address the user's immediate needs and long-term progress
3. Include detailed guidance on how to respond to the user in the 'approach' field
4. Ensure all user context is preserved in the plan for future responses
5. Be specific about therapeutic techniques to apply in conversations


GOALS RULES:
- Each goal must have exactly one clear, actionable item (single responsibility principle)
- Every goal must be associated with a specific conversation state (INFO_GATHERING, ACTIVE_GUIDANCE, etc.)
- Goals should be measurable with clear completion criteria
- Include meaningful, unique codenames for each goal for easy reference
- Goals must have detailed approach instructions for the AI to follow
- Order goals in a logical therapeutic progression
- Include specific techniques relevant to each goal
- Goals should be responsive to user's current emotional and cognitive state
- Consider risk levels when formulating goals
- Goals should build on user's progress and history

return format: {
  "goals": [
    { 
      "codename": "", // unique meaningful identifier
      "state": "${Object.keys(ConversationState).join('/')}", 
      "content": "", // The goal description
      "approach": "DETAILED instructions on how to respond to the user regarding this goal, including tone, style, specific questions to ask, and how to incorporate user's history and context"
    }
  ],
  "techniques": ["list of specific therapeutic techniques to use"],
  "approach": "Overall conversation approach including detailed instructions for responding to the user that preserves and uses ALL relevant user context",
  "focus": "Current therapeutic focus area",
  "riskFactors": ["Any identified risk factors to monitor"],
  "metrics": {
    "completedGoals": ["goals that have been achieved"],
    "progress": "assessment of overall progress"
  }
}`;
  }

  /**
   * Gets, parses and validates the basic structure of a plan from LLM
   */
  private async getValidatedPlanContent(prompt: string): Promise<PlanContent> {
    const revisedContent = await this.llmGateway.generateCompletion(prompt, {
      model: 'deepseek/deepseek-r1',
      maxTokens: 5000,
      temperature: 0.8,
    });

    try {
      console.log('revisedContent', revisedContent);
      const parsedContent = JSON.parse(revisedContent);

      // Validate required fields
      if (
        !parsedContent.goals ||
        !Array.isArray(parsedContent.goals) ||
        !parsedContent.techniques ||
        !Array.isArray(parsedContent.techniques) ||
        !parsedContent.approach ||
        typeof parsedContent.approach !== 'string'
      ) {
        throw new Error('Invalid plan content format');
      }

      return parsedContent;
    } catch (error: any) {
      throw new Error(`Failed to parse revised plan content: ${error.message}`);
    }
  }
}

// Error classes
export class PlanValidationError extends Error {
  constructor(public readonly errors: string[]) {
    super(`Plan validation failed: ${errors.join('; ')}`);
  }
}

export class ContextShiftError extends Error {
  constructor(public readonly similarity: number) {
    super(`Significant context shift detected (similarity: ${similarity.toFixed(2)})`);
  }
}
