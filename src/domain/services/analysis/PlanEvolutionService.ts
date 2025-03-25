import { LLMAdapter } from 'src/infrastructure/llm/openai/LLMAdapter';
import { ConversationContext } from '../../aggregates/conversation/entities/types';
import { TherapeuticPlan } from '../../aggregates/therapy/entities/TherapeuticPlan';
import { PlanContent, PlanVersion } from '../../aggregates/therapy/entities/PlanVersion';
import { v4 as uuidv4 } from 'uuid';
import { Message } from '../../aggregates/conversation/entities/Message';
import { buildPlanRevisionPrompt } from './prompts/planRevision';

export class PlanEvolutionService {
  private readonly MAX_HISTORY_DEPTH = 40;

  constructor(private readonly llmGateway: LLMAdapter) {}

  generateInitialPlan(): PlanContent {
    return {
      goals: [
        {
          codename: 'starting',
          state: 'INFO_GATHERING',
          content: 'greet user, get to know the person better',
          approach: 'establish contact, find out why user came',
          conditions: 'if conversation started',
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
      const prompt = buildPlanRevisionPrompt({
        contextUpdate,
        message,
        existingPlan,
        maxHistoryDepth: this.MAX_HISTORY_DEPTH,
      });

      console.log('prompt revision', prompt);
      const parsedContent = await this.getValidatedPlanContent(prompt);
      const newVersion = existingPlan.createNewVersion(parsedContent);
      return newVersion;
    } catch (error: any) {
      if (error instanceof PlanValidationError) {
        throw error;
      }
      throw new Error(`Failed to revise plan: ${error.message}`);
    }
  }

  private async getValidatedPlanContent(prompt: string): Promise<PlanContent> {
    const revisedContent = await this.llmGateway.generateCompletion(prompt, {
      model: 'deepseek/deepseek-r1',
      maxTokens: 5000,
      temperature: 0.5,
    });

    try {
      console.log('revisedContent', revisedContent);
      const parsedContent = JSON.parse(revisedContent);

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
