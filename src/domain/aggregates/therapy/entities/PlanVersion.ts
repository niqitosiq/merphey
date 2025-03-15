import { PlanVersion as PrismaPlanVersion, Prisma } from '@prisma/client';
import { TherapeuticPlan } from './TherapeuticPlan';

export interface PlanContent extends Record<string, any> {
  goals: string[];
  techniques: string[];
  approach: string;
  metrics?: {
    completedGoals?: string[];
    [key: string]: any;
  };
  focus?: string;
}

/**
 * Domain entity representing a specific version of a therapeutic plan
 * Maintains version history and allows for plan evolution over time
 */
export class PlanVersion
  implements
    Omit<
      PrismaPlanVersion,
      'therapeuticPlan' | 'previousVersion' | 'nextVersions' | 'currentOfPlan'
    >
{
  constructor(
    public readonly id: string,
    public readonly planId: string,
    public readonly previousVersionId: string | null,
    public readonly content: Prisma.JsonValue,
    public readonly validationScore: number | null,
    public readonly version: number,
    public readonly createdAt: Date,
    public nextVersions?: PlanVersion[],
    public previousVersion?: PlanVersion | null,
    public currentOfPlan?: TherapeuticPlan | null,
  ) {}

  /**
   * Checks if this version has subsequent versions
   */
  hasNextVersions(): boolean {
    return !!(this.nextVersions && this.nextVersions.length > 0);
  }

  /**
   * Gets all next versions in the chain
   */
  getNextVersions(): PlanVersion[] {
    return this.nextVersions || [];
  }

  /**
   * Gets the previous version in the chain
   */
  getPreviousVersion(): PlanVersion | null {
    return this.previousVersion || null;
  }

  /**
   * Validates if this version requires human review based on changes
   */
  requiresHumanReview(): boolean {
    return this.validationScore !== null && this.validationScore < 0.7;
  }

  /**
   * Gets the content of this version
   */
  getContent(): PlanContent {
    return this.content as PlanContent;
  }

  /**
   * Validates the consistency of this version with previous version
   */
  validateConsistency(previousVersion?: PlanVersion): boolean {
    if (!previousVersion) {
      return true; // First version is always consistent
    }

    // Check version number increment
    if (this.version !== previousVersion.version + 1) {
      return false;
    }

    const content = this.getContent();
    const previousContent = previousVersion.getContent();

    // Ensure no critical goals are abandoned without being marked as completed
    const previousGoals = new Set(previousContent.goals);
    const currentGoals = new Set(content.goals);

    // All previous goals should either still exist or be marked as completed in metrics
    for (const goal of previousGoals) {
      if (!currentGoals.has(goal) && !this.isGoalCompleted(goal)) {
        return false;
      }
    }

    // Validate techniques align with approach
    return this.validateTechniquesAlignment();
  }

  private isGoalCompleted(goal: string): boolean {
    const content = this.getContent();
    return !!content.metrics?.completedGoals?.includes(goal);
  }

  private validateTechniquesAlignment(): boolean {
    // This would contain logic to ensure techniques match the therapeutic approach
    // For now, we'll assume all techniques are valid
    return true;
  }
}
