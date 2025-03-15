/**
 * TherapeuticPlanAggregate - Manages the lifecycle and behavior of therapeutic plans
 */

import {
  TherapeuticPlanData,
  PlanStep,
  Checkpoint,
  PlanStepType,
} from '../value-objects/therapeutic-plan.value-object';

export class TherapeuticPlanAggregate {
  private plan: TherapeuticPlanData;

  constructor(plan: TherapeuticPlanData) {
    this.plan = plan;
  }

  /**
   * Get the current plan data
   */
  getPlan(): TherapeuticPlanData {
    return { ...this.plan }; // Return a copy to prevent direct mutation
  }

  /**
   * Add a new step to the plan
   */
  addStep(step: Omit<PlanStep, 'id'>): string {
    const newStep: PlanStep = {
      ...step,
      id: crypto.randomUUID(),
    };

    this.plan = {
      ...this.plan,
      steps: [...this.plan.steps, newStep],
      updatedAt: new Date(),
    };

    return newStep.id;
  }

  /**
   * Remove a step from the plan
   */
  removeStep(stepId: string): boolean {
    const stepIndex = this.plan.steps.findIndex((s) => s.id === stepId);

    if (stepIndex === -1) {
      return false;
    }

    // Check if any other steps depend on this one
    const dependentSteps = this.plan.steps.filter((s) => s.prerequisiteStepIds?.includes(stepId));

    if (dependentSteps.length > 0) {
      throw new Error(
        `Cannot remove step ${stepId} as other steps depend on it: ${dependentSteps
          .map((s) => s.id)
          .join(', ')}`,
      );
    }

    // Remove related checkpoints
    const updatedCheckpoints = this.plan.checkpoints.filter((c) => c.stepId !== stepId);

    this.plan = {
      ...this.plan,
      steps: this.plan.steps.filter((s) => s.id !== stepId),
      checkpoints: updatedCheckpoints,
      updatedAt: new Date(),
    };

    return true;
  }

  /**
   * Add a checkpoint to a step
   */
  addCheckpoint(stepId: string, description: string, criteria: string[]): string {
    // Ensure step exists
    if (!this.plan.steps.some((s) => s.id === stepId)) {
      throw new Error(`Cannot add checkpoint to non-existent step: ${stepId}`);
    }

    const newCheckpoint: Checkpoint = {
      id: crypto.randomUUID(),
      stepId,
      description,
      validationCriteria: criteria,
      isCompleted: false,
    };

    this.plan = {
      ...this.plan,
      checkpoints: [...this.plan.checkpoints, newCheckpoint],
      updatedAt: new Date(),
    };

    return newCheckpoint.id;
  }

  /**
   * Mark a checkpoint as completed
   */
  completeCheckpoint(checkpointId: string): boolean {
    const index = this.plan.checkpoints.findIndex((c) => c.id === checkpointId);

    if (index === -1) {
      return false;
    }

    const updatedCheckpoints = [...this.plan.checkpoints];
    updatedCheckpoints[index] = {
      ...updatedCheckpoints[index],
      isCompleted: true,
      completedAt: new Date(),
    };

    this.plan = {
      ...this.plan,
      checkpoints: updatedCheckpoints,
      updatedAt: new Date(),
    };

    return true;
  }

  /**
   * Create a new version of the plan (for plan revisions)
   */
  createNewVersion(): TherapeuticPlanAggregate {
    const newPlan: TherapeuticPlanData = {
      id: crypto.randomUUID(),
      version: this.plan.version + 1,
      createdAt: new Date(),
      updatedAt: new Date(),
      steps: [...this.plan.steps],
      checkpoints: this.plan.checkpoints.map((c) => ({
        ...c,
        isCompleted: false,
        completedAt: undefined,
      })),
      targetOutcomes: [...this.plan.targetOutcomes],
      previousVersionId: this.plan.id,
    };

    return new TherapeuticPlanAggregate(newPlan);
  }

  /**
   * Calculate the completion percentage of the plan
   */
  calculateCompletion(): number {
    if (this.plan.checkpoints.length === 0) {
      return 0;
    }

    const completedCount = this.plan.checkpoints.filter((c) => c.isCompleted).length;
    return (completedCount / this.plan.checkpoints.length) * 100;
  }

  /**
   * Update the effectiveness score of the plan
   */
  updateEffectivenessScore(score: number): void {
    if (score < 0 || score > 100) {
      throw new Error('Effectiveness score must be between 0 and 100');
    }

    this.plan = {
      ...this.plan,
      effectivenessScore: score,
      updatedAt: new Date(),
    };
  }

  /**
   * Get the next recommended step based on completion status
   */
  getNextRecommendedStep(): PlanStep | null {
    // Get completed step IDs
    const completedStepIds = new Set(
      this.plan.checkpoints.filter((c) => c.isCompleted).map((c) => c.stepId),
    );

    // Find steps that are not completed
    const incompleteSteps = this.plan.steps.filter((step) => {
      // Check if all checkpoints for this step are completed
      const stepCheckpoints = this.plan.checkpoints.filter((c) => c.stepId === step.id);
      if (stepCheckpoints.length === 0) return true; // No checkpoints means incomplete

      const allCheckpointsComplete = stepCheckpoints.every((c) => c.isCompleted);
      return !allCheckpointsComplete;
    });

    // Filter steps whose prerequisites are met
    const availableSteps = incompleteSteps.filter((step) => {
      // If no prerequisites, step is available
      if (!step.prerequisiteStepIds || step.prerequisiteStepIds.length === 0) {
        return true;
      }

      // Check if all prerequisites are completed
      return step.prerequisiteStepIds.every((id) => completedStepIds.has(id));
    });

    // Sort by priority (assessment > coping > others)
    const priorityOrder = {
      [PlanStepType.CRISIS_RESPONSE]: 0,
      [PlanStepType.ASSESSMENT]: 1,
      [PlanStepType.COPING_STRATEGY]: 2,
      [PlanStepType.EXERCISE]: 3,
      [PlanStepType.REFLECTION]: 4,
      [PlanStepType.EDUCATION]: 5,
    };

    availableSteps.sort((a, b) => {
      return (priorityOrder[a.type] || 99) - (priorityOrder[b.type] || 99);
    });

    return availableSteps[0] || null;
  }
}
