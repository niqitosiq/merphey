import { v4 as uuidv4 } from 'uuid';
import { TherapeuticPlan } from './TherapeuticPlan';
import { PlanVersion, PlanContent } from './PlanVersion';
import {
  TherapeuticPlan as PrismaTherapeuticPlan,
  PlanVersion as PrismaPlanVersion,
} from '@prisma/client';

/**
 * Factory for creating therapeutic plan entities
 * Handles both creation of new plans and reconstitution from persistence
 */
export class TherapeuticPlanFactory {
  /**
   * Creates a new therapeutic plan
   */
  createPlan(params: { userId: string; initialContent: PlanContent }): TherapeuticPlan {
    const planId = uuidv4();
    const now = new Date();

    // Create initial version
    const initialVersion = new PlanVersion(
      uuidv4(),
      planId,
      null, // No previous version for initial version
      params.initialContent,
      1.0, // Initial version is fully valid
      1, // First version
      now,
    );

    // Create the plan with initial version
    return new TherapeuticPlan(
      planId,
      params.userId,
      [initialVersion],
      initialVersion,
      initialVersion.id,
      now,
      now,
    );
  }

  /**
   * Reconstructs a therapeutic plan from persistence data
   */
  reconstitute(
    data: PrismaTherapeuticPlan & {
      versions: PrismaPlanVersion[];
      currentVersion: PrismaPlanVersion | null;
    },
  ): TherapeuticPlan {
    // Map versions to domain entities
    const versions = data.versions.map(
      (version) =>
        new PlanVersion(
          version.id,
          version.planId,
          version.previousVersionId,
          version.content,
          version.validationScore,
          version.version,
          version.createdAt,
        ),
    );

    // Find current version object
    const currentVersion = data.currentVersion
      ? versions.find((v) => v.id === data.currentVersionId) || null
      : null;

    return new TherapeuticPlan(
      data.id,
      data.userId,
      versions,
      currentVersion,
      data.currentVersionId,
      data.createdAt,
      data.updatedAt,
    );
  }
}
