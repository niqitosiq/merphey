import {
  PrismaClient,
  TherapeuticPlan as PrismaTherapeuticPlan,
  PlanVersion as PrismaPlanVersion,
} from '@prisma/client';
import { TherapeuticPlan } from '../../../domain/aggregates/therapy/entities/TherapeuticPlan';
import { PlanContent, PlanVersion } from '../../../domain/aggregates/therapy/entities/PlanVersion';
import { ApplicationError } from '../../../shared/errors/application-errors';
import { InputJsonValue, JsonValue } from '@prisma/client/runtime/library';

export class TherapeuticPlanRepository {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = new PrismaClient();
  }

  /**
   * Find a therapeutic plan by ID
   * @param id - The therapeutic plan identifier
   * @returns The therapeutic plan or undefined if not found
   * @throws ApplicationError if database operation fails
   */
  async findById(id: string): Promise<TherapeuticPlan | undefined> {
    try {
      const plan = await this.prisma.therapeuticPlan.findUnique({
        where: { id },
        include: {
          versions: {
            orderBy: {
              version: 'desc',
            },
          },
          currentVersion: true,
        },
      });

      if (!plan) {
        return undefined;
      }

      return this.mapToDomainModel(plan);
    } catch (error) {
      throw new ApplicationError(
        'Failed to retrieve therapeutic plan',
        'PLAN_RETRIEVAL_ERROR',
        'HIGH',
      );
    }
  }

  /**
   * Create a new therapeutic plan
   * @param data - Plan creation data
   * @returns The created therapeutic plan
   * @throws ApplicationError if plan creation fails
   */
  async createPlan(data: {
    userId: string;
    initialContent: PlanContent;
  }): Promise<TherapeuticPlan> {
    try {
      // Create the plan
      const plan = await this.prisma.therapeuticPlan.create({
        data: {
          userId: data.userId,
        },
      });

      // Create initial version
      const version = await this.prisma.planVersion.create({
        data: {
          version: 1,
          planId: plan.id,
          content: JSON.stringify(data.initialContent),
          validationScore: 1.0, // Initial version is fully valid
        },
      });

      // Set as current version
      const updatedPlan = await this.prisma.therapeuticPlan.update({
        where: { id: plan.id },
        data: {
          currentVersionId: version.id,
        },
        include: {
          versions: true,
          currentVersion: true,
        },
      });

      return this.mapToDomainModel(updatedPlan);
    } catch (error) {
      throw new ApplicationError(
        'Failed to create therapeutic plan',
        'PLAN_CREATION_ERROR',
        'HIGH',
      );
    }
  }

  /**
   * Create a new version of an existing plan
   * @param planId - The therapeutic plan identifier
   * @param previousVersionId - ID of the previous version
   * @param content - New version content
   * @param validationScore - Score validating version consistency
   * @returns The ID of the newly created version
   * @throws ApplicationError if version creation fails
   */
  async createPlanVersion(
    planId: string,
    previousVersionId: string | null,
    content: InputJsonValue,
    validationScore: number,
  ): Promise<string> {
    try {
      // Validate plan exists
      const plan = await this.prisma.therapeuticPlan.findUnique({
        where: { id: planId },
        include: { versions: true },
      });

      if (!plan) {
        throw new ApplicationError('Plan not found', 'PLAN_NOT_FOUND', 'HIGH');
      }

      // Get the highest version number
      const latestVersion = await this.prisma.planVersion.findFirst({
        where: { planId },
        orderBy: { version: 'desc' },
      });

      const versionNumber = latestVersion ? latestVersion.version + 1 : 1;

      console.log('data', versionNumber, planId, previousVersionId, content, validationScore);
      // Create the new version
      const newVersion = await this.prisma.planVersion.create({
        data: {
          version: versionNumber,
          planId: planId,
          previousVersionId: previousVersionId,
          content: content,
          validationScore: validationScore,
        },
      });

      // Update the plan to use the new version
      await this.prisma.therapeuticPlan.update({
        where: { id: planId },
        data: {
          currentVersionId: newVersion.id,
          updatedAt: new Date(),
        },
      });

      return newVersion.id;
    } catch (error: any) {
      console.log(error);

      if (error instanceof ApplicationError) {
        throw error;
      }
      throw new ApplicationError('Failed to create plan version', error.message, 'HIGH');
    }
  }

  /**
   * Update the content of a plan version
   * @param versionId - The version identifier
   * @param content - Updated content
   * @returns Boolean indicating success
   * @throws ApplicationError if update fails
   */
  async updateVersionContent(
    versionId: string,
    content: Record<string, any>,
  ): Promise<PrismaPlanVersion> {
    try {
      const updated = await this.prisma.planVersion.update({
        where: { id: versionId },
        data: {
          content,
        },
      });

      return updated;
    } catch (error) {
      throw new ApplicationError(
        'Failed to update version content',
        'VERSION_UPDATE_ERROR',
        'MEDIUM',
      );
    }
  }

  /**
   * Get all versions of a plan
   * @param planId - The therapeutic plan identifier
   * @returns Array of plan versions
   * @throws ApplicationError if retrieval fails
   */
  async getPlanVersionHistory(planId: string): Promise<PlanVersion[]> {
    try {
      const versions = await this.prisma.planVersion.findMany({
        where: { planId },
        orderBy: { version: 'asc' },
      });

      return versions.map((version) => this.mapVersionToDomainModel(version));
    } catch (error) {
      throw new ApplicationError(
        'Failed to retrieve plan version history',
        'VERSION_HISTORY_ERROR',
        'MEDIUM',
      );
    }
  }

  /**
   * Find plans by user ID
   * @param userId - The user identifier
   * @returns Array of therapeutic plans
   * @throws ApplicationError if retrieval fails
   */
  async findByUserId(userId: string): Promise<TherapeuticPlan[]> {
    try {
      const plans = await this.prisma.therapeuticPlan.findMany({
        where: { userId },
        include: {
          versions: {
            orderBy: {
              version: 'desc',
            },
          },
          currentVersion: true,
        },
      });

      return plans.map((plan) => this.mapToDomainModel(plan));
    } catch (error) {
      throw new ApplicationError('Failed to retrieve user plans', 'USER_PLANS_ERROR', 'HIGH');
    }
  }

  /**
   * Maps a Prisma version to a domain model version
   * @param prismaVersion - The Prisma version model
   * @returns Domain model version
   */
  private mapVersionToDomainModel(prismaVersion: PrismaPlanVersion): PlanVersion {
    return new PlanVersion(
      prismaVersion.id,
      prismaVersion.planId,
      prismaVersion.previousVersionId || null,
      prismaVersion.content,
      prismaVersion.validationScore || null,
      prismaVersion.version,
      prismaVersion.createdAt,
    );
  }

  /**
   * Maps a Prisma therapeutic plan to a domain model
   * @param prismaPlan - The Prisma therapeutic plan
   * @returns Domain model therapeutic plan
   */
  private mapToDomainModel(
    prismaPlan: PrismaTherapeuticPlan & {
      versions: PrismaPlanVersion[];
      currentVersion: PrismaPlanVersion | null;
    },
  ): TherapeuticPlan {
    const versions = prismaPlan.versions.map((version) => this.mapVersionToDomainModel(version));
    console.log('prismaPlan.currentVersion', prismaPlan.currentVersion);
    return new TherapeuticPlan(
      prismaPlan.id,
      prismaPlan.userId,
      versions,
      prismaPlan.currentVersion ? this.mapVersionToDomainModel(prismaPlan.currentVersion) : null,
      prismaPlan.currentVersion?.id || null,
      prismaPlan.createdAt,
      prismaPlan.updatedAt,
    );
  }
}
