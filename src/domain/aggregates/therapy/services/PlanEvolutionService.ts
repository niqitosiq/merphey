import { LLMAdapter } from 'src/infrastructure/llm/openai/LLMAdapter';
import { TherapeuticPlanRepository } from 'src/infrastructure/persistence/postgres/PlanRepository';
import { ConversationContext } from '../../conversation/entities/types';
import { TherapeuticPlan } from '../entities/TherapeuticPlan';
import { PlanContent, PlanVersion } from '../entities/PlanVersion';
import { v4 as uuidv4 } from 'uuid';
import { AnalysisResult } from 'src/domain/services/analysis/CognitiveAnalysisService';
import { ConversationState } from '@prisma/client';
import { Message } from '../../conversation/entities/Message';

interface PlanValidationResult {
  isValid: boolean;
  errors: string[];
}

export class PlanEvolutionService {
  private readonly CONTEXT_SIMILARITY_THRESHOLD = 0.7;
  private readonly MAX_HISTORY_DEPTH = 40;

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

    return new PlanVersion(uuidv4(), currentPlan.id, null, initialContent, null, 1, new Date());
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

    const userInsights =
      contextUpdate.history
        ?.filter((msg) => msg.metadata?.breakthrough || msg.metadata?.challenge)
        .map((msg) => `- ${msg.metadata?.breakthrough || msg.metadata?.challenge}`)
        .join('\n') || 'No specific insights recorded yet';

    // Build instruction section with clear guidance on response format
    return `**THERAPEUTIC PLAN REVISION REQUEST**

**Key User Context:**  
- Current State: ${contextUpdate.currentState}  
- Recent Messages:  
${recentMessages.map((m) => `[${m.role}]: '${m.content}'`).join('\n')}  
- Key Insights: ${userInsights || 'No specific insights recorded yet'}  
- Risk Profile: ${JSON.stringify(userRiskProfile)}

**Therapeutic Plan Context:**  
- Focus Area: ${focus}  
- General Approach: ${approach}  
- Techniques: ${techniques}

**Current Goals:**  
${currentGoals.map((goal) => `- [${goal.state}] ${goal.content} (Approach: ${goal.approach})`).join('\n') || 'No goals currently defined'}

**Instructions for Response:**  
1. Analyze the user's current state and recent messages.  
2. Update the therapeutic plan to address immediate needs and long-term progress.  
3. Ensure the plan is tailored to the user's context and history.  
4. Provide clear, actionable goals with specific approaches.
5. Don't use double quotes inside the json strings.

**Goals Guidelines:**  
- Each goal should be clear and actionable.  
- Goals should be tailored to the user's current state and needs.  
- Goals should build on the user's progress and history.

**Return Format:**
{
  "goals": [
    {
      "codename": "unique_identifier",
      "state": "INFO_GATHERING/ACTIVE_GUIDANCE/etc.",
      "content": "Goal description",
      "approach": "Detailed instructions for responding to the user"
    }
  ],
  "techniques": ["list of techniques"],
  "approach": "Overall conversation approach",
  "focus": "Current therapeutic focus",
  "riskFactors": ["identified risk factors"],
  "metrics": {
    "completedGoals": ["achieved goals"],
    "progress": "assessment of progress"
  }
}`;
  }

  /**
   * Gets, parses and validates the basic structure of a plan from LLM
   */
  private async getValidatedPlanContent(prompt: string): Promise<PlanContent> {
    const revisedContent = await this.llmGateway.generateCompletion(prompt, {
      // model: 'google/gemma-3-27b-it',
      model: 'deepseek/deepseek-r1',
      maxTokens: 5000,
      temperature: 0.5,
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
