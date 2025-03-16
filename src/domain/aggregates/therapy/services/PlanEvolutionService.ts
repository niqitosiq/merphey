import { LLMAdapter } from 'src/infrastructure/llm/openai/LLMAdapter';
import { TherapeuticPlanRepository } from 'src/infrastructure/persistence/postgres/PlanRepository';
import { ConversationContext } from '../../conversation/entities/types';
import { TherapeuticPlan } from '../entities/TherapeuticPlan';
import { PlanContent } from '../entities/PlanVersion';

interface PlanValidationResult {
  isValid: boolean;
  errors: string[];
}

export class PlanEvolutionService {
  private readonly CONTEXT_SIMILARITY_THRESHOLD = 0.7;
  private readonly MAX_HISTORY_DEPTH = 5;

  constructor(
    private readonly planRepository: TherapeuticPlanRepository,
    private readonly llmGateway: LLMAdapter,
  ) {}

  generateInitialPlan(): PlanContent {
    return {
      goals: ['get to know the person better', 'establish contact', 'find out why he came'],
      approach: 'open-ended questions',
      techniques: ['active listening', 'empathy'],
    };
  }

  async createInitialPlan(userId: string): Promise<TherapeuticPlan> {
    const initialContent = this.generateInitialPlan();

    return await this.planRepository.createPlan({
      userId,
      initialContent,
    });
  }

  async revisePlan(
    existingPlan: TherapeuticPlan,
    contextUpdate: ConversationContext,
  ): Promise<TherapeuticPlan> {
    // Validate existing plan has a current version
    if (!existingPlan.currentVersion) {
      throw new Error('Cannot revise plan: no current version exists');
    }

    try {
      // Construct a single comprehensive prompt for the LLM
      const prompt = this.buildRevisionPrompt(existingPlan, contextUpdate);

      // Get and parse the revised content in one step
      const parsedContent = await this.getValidatedPlanContent(prompt);

      // Validate the new plan against the previous one
      const validation = await this.validatePlanRevision(
        existingPlan.currentVersion.content as unknown as PlanContent,
        parsedContent,
      );

      if (!validation.isValid) {
        throw new PlanValidationError(validation.errors);
      }

      // Create new version and update the plan
      const newVersion = existingPlan.createNewVersion(parsedContent);

      const updated = await this.planRepository.updateVersionContent(existingPlan.id, newVersion);

      // Save the updated plan and return
      return new TherapeuticPlan(
        updated.id,
        existingPlan.userId,
        existingPlan.versions.concat(newVersion),
        newVersion,
        newVersion.id,
        existingPlan.createdAt,
        new Date(),
      );
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
   * Builds a comprehensive prompt for plan revision
   */
  private buildRevisionPrompt(
    existingPlan: TherapeuticPlan,
    contextUpdate: ConversationContext,
  ): string {
    return `Revise therapeutic plan based on new context.
Current plan: ${JSON.stringify(existingPlan.currentVersion?.content)}
New context: ${contextUpdate.history
      .slice(-this.MAX_HISTORY_DEPTH)
      .map((m) => `[${m.role}]: ${m.content}`)
      .join('\n')}

Goals:
${existingPlan.getCurrentGoals().join('\n')}
Techniques:
${existingPlan.getRecommendedTechniques().join('\n')}

return format: {
  goals: [],
  techniques: [],
  approach: '',
  metrics: {},
  focus: '',
}`;
  }

  /**
   * Gets, parses and validates the basic structure of a plan from LLM
   */
  private async getValidatedPlanContent(prompt: string): Promise<PlanContent> {
    const revisedContent = await this.llmGateway.generateCompletion(prompt);

    try {
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

  private async validatePlanRevision(
    previousContent: PlanContent,
    newContent: PlanContent,
  ): Promise<PlanValidationResult> {
    const errors: string[] = [];

    // Check goal continuity
    const removedGoals = previousContent.goals.filter(
      (g) =>
        !newContent.goals.includes(g) &&
        !(newContent.metrics?.completedGoals?.includes(g) || false),
    );

    if (removedGoals.length > 0) {
      errors.push(`Removed goals without completion: ${removedGoals.join(', ')}`);
    }

    // Only validate risk factors if they exist in the previous content
    if (previousContent.riskFactors) {
      const previousRiskFactors = Array.isArray(previousContent.riskFactors)
        ? previousContent.riskFactors
        : [];

      const currentRiskFactors = Array.isArray(newContent.riskFactors)
        ? newContent.riskFactors
        : [];

      const unaddressedRisks = previousRiskFactors.filter((r) => !currentRiskFactors.includes(r));

      if (unaddressedRisks.length > 0) {
        errors.push(`Unaddressed risks: ${unaddressedRisks.join(', ')}`);
      }
    }

    // LLM-based validation
    try {
      const llmValidationPrompt = `
        Validate if the new therapeutic plan version is consistent with the previous version.
        
        Previous plan:
        ${JSON.stringify(previousContent)}
        
        New plan:
        ${JSON.stringify(newContent)}
        
        Check for:
        1. Abandoned goals without completion
        2. Inconsistent therapeutic approaches
        3. Lack of continuity between versions
        
        Return format:
        {
          "isValid": boolean,
          "errors": string[]
        }
      `;

      const llmValidationResponse = await this.llmGateway.generateCompletion(llmValidationPrompt);
      let llmValidation: { isValid: boolean; errors: string[] };

      try {
        llmValidation = JSON.parse(llmValidationResponse);
      } catch (error) {
        llmValidation = { isValid: false, errors: ['Failed to parse LLM validation response'] };
      }

      if (!llmValidation.isValid) {
        errors.push(...llmValidation.errors);
      }
    } catch (error: any) {
      errors.push(`LLM validation failed: ${error.message}`);
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
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
