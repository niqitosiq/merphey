import { PrismaClient, Prisma, PlanStepType as PrismaStepType } from '@prisma/client';
import {
  TherapeuticPlanData,
  PlanStepType,
} from '../../../domain/plan-management/value-objects/therapeutic-plan.value-object';
import { UUID } from 'crypto';

type PlanWithRelations = Prisma.PlanGetPayload<{
  include: {
    steps: true;
    checkpoints: true;
  };
}>;

export class PrismaPlanRepository {
  constructor(private prisma: PrismaClient) {}

  async findById(id: UUID): Promise<TherapeuticPlanData | null> {
    const plan = await this.prisma.plan.findUnique({
      where: { id },
      include: {
        steps: true,
        checkpoints: true,
      },
    });

    if (!plan) return null;

    return this.toDomain(plan as PlanWithRelations);
  }

  async findByUserId(userId: string): Promise<TherapeuticPlanData[]> {
    const plans = await this.prisma.plan.findMany({
      where: { userId },
      include: {
        steps: true,
        checkpoints: true,
      },
    });

    return plans.map((plan) => this.toDomain(plan as PlanWithRelations));
  }

  async save(plan: TherapeuticPlanData & { userId: string }): Promise<void> {
    await this.prisma.plan.upsert({
      where: { id: plan.id },
      update: {
        version: plan.version,
        effectivenessScore: plan.effectivenessScore ?? null,
        targetOutcomes: plan.targetOutcomes,
        previousVersionId: plan.previousVersionId ?? null,
        userId: plan.userId,
        steps: {
          deleteMany: {},
          create: plan.steps.map((step) => ({
            id: step.id,
            type: this.toPrismaStepType(step.type),
            title: step.title,
            description: step.description,
            estimatedTimeMinutes: step.estimatedTimeMinutes,
            resources: step.resources || [],
            suggestedPrompts: step.suggestedPrompts || [],
          })),
        },
        checkpoints: {
          deleteMany: {},
          create: plan.checkpoints.map((checkpoint) => ({
            id: checkpoint.id,
            description: checkpoint.description,
            validationCriteria: checkpoint.validationCriteria,
            isCompleted: checkpoint.isCompleted,
            completedAt: checkpoint.completedAt ?? null,
            stepId: checkpoint.stepId,
          })),
        },
      },
      create: {
        id: plan.id,
        version: plan.version,
        effectivenessScore: plan.effectivenessScore ?? null,
        targetOutcomes: plan.targetOutcomes,
        previousVersionId: plan.previousVersionId ?? null,
        userId: plan.userId,
        steps: {
          create: plan.steps.map((step) => ({
            id: step.id,
            type: this.toPrismaStepType(step.type),
            title: step.title,
            description: step.description,
            estimatedTimeMinutes: step.estimatedTimeMinutes,
            resources: step.resources || [],
            suggestedPrompts: step.suggestedPrompts || [],
          })),
        },
        checkpoints: {
          create: plan.checkpoints.map((checkpoint) => ({
            id: checkpoint.id,
            description: checkpoint.description,
            validationCriteria: checkpoint.validationCriteria,
            isCompleted: checkpoint.isCompleted,
            completedAt: checkpoint.completedAt ?? null,
            stepId: checkpoint.stepId,
          })),
        },
      },
    });
  }

  private toPrismaStepType(type: PlanStepType): PrismaStepType {
    return type as unknown as PrismaStepType; // Safe because enums have same values
  }

  private toDomain(prismaModel: PlanWithRelations): TherapeuticPlanData {
    return {
      id: prismaModel.id as UUID,
      version: prismaModel.version,
      createdAt: prismaModel.createdAt,
      updatedAt: prismaModel.updatedAt,
      steps: prismaModel.steps.map((step) => ({
        id: step.id,
        type: step.type as unknown as PlanStepType, // Safe because enums have same values
        title: step.title,
        description: step.description,
        estimatedTimeMinutes: step.estimatedTimeMinutes,
        resources: step.resources,
        suggestedPrompts: step.suggestedPrompts,
      })),
      checkpoints: prismaModel.checkpoints.map((checkpoint) => ({
        id: checkpoint.id,
        stepId: checkpoint.stepId,
        description: checkpoint.description,
        validationCriteria: checkpoint.validationCriteria,
        isCompleted: checkpoint.isCompleted,
        completedAt: checkpoint.completedAt ?? undefined,
      })),
      effectivenessScore: prismaModel.effectivenessScore ?? undefined,
      targetOutcomes: prismaModel.targetOutcomes,
      previousVersionId: prismaModel.previousVersionId ?? undefined,
    };
  }
}
