import { ConversationState, PlanVersion as PrismaPlanVersion } from '@prisma/client';
import { TherapeuticPlan } from './TherapeuticPlan';

export type Goal = {
  codename: string;
  state: ConversationState;
  content: string;
  approach: string;
};

export interface PlanContent {
  goals?: Goal[];
  techniques?: string[];
  approach?: string;
  metrics?: {
    completedGoals?: string[];
    [key: string]: any;
  };
  focus?: string;
  riskFactors?: string[];
}

/**
 * Domain entity representing a specific version of a therapeutic plan
 * Maintains version history and allows for plan evolution over time
 */
export class PlanVersion
  implements
    Omit<
      PrismaPlanVersion,
      'therapeuticPlan' | 'previousVersion' | 'nextVersions' | 'currentOfPlan' | 'content'
    >
{
  constructor(
    public readonly id: string,
    public readonly planId: string,
    public readonly previousVersionId: string | null,
    public readonly content: PlanContent,
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
    return this.content as unknown as PlanContent;
  }
}
