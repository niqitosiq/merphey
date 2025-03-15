import { TherapeuticPlanAggregate } from '../aggregates/therapeutic-plan.aggregate';
import { TherapeuticPlanValidator } from '../validation/therapeutic-plan.validator';

export class PlanVersioningService {
  constructor(private validator: TherapeuticPlanValidator) {}

  async createRevision(previousPlan: TherapeuticPlanAggregate, changes: Partial<any>): Promise<TherapeuticPlanAggregate> {
    const newPlan = new TherapeuticPlanAggregate({
      ...previousPlan.getPlan(),
      ...changes,
      version: previousPlan.getVersion() + 1,
      previousVersion: previousPlan.getVersion(),
      createdAt: new Date(),
      revisionReason: changes.revisionReason || 'Plan update'
    });

    // Validate the new plan
    const validationResult = this.validator.validate(newPlan.getPlan());
    if (!validationResult.isValid) {
      throw new Error(`Invalid plan revision: ${validationResult.errors.map(e => e.message).join(', ')}`);
    }

    return newPlan;
  }

  compareVersions(oldPlan: TherapeuticPlanAggregate, newPlan: TherapeuticPlanAggregate): PlanDifferences {
    const differences: PlanDifferences = {
      addedSteps: [],
      removedSteps: [],
      modifiedSteps: [],
      addedCheckpoints: [],
      removedCheckpoints: [],
      modifiedCheckpoints: []
    };

    // Compare steps
    const oldSteps = oldPlan.getPlan().steps;
    const newSteps = newPlan.getPlan().steps;

    // Find added and modified steps
    newSteps.forEach(newStep => {
      const oldStep = oldSteps.find(s => s.id === newStep.id);
      if (!oldStep) {
        differences.addedSteps.push(newStep);
      } else if (JSON.stringify(oldStep) !== JSON.stringify(newStep)) {
        differences.modifiedSteps.push({
          old: oldStep,
          new: newStep
        });
      }
    });

    // Find removed steps
    oldSteps.forEach(oldStep => {
      if (!newSteps.find(s => s.id === oldStep.id)) {
        differences.removedSteps.push(oldStep);
      }
    });

    // Similar comparison for checkpoints
    const oldCheckpoints = oldPlan.getPlan().checkpoints;
    const newCheckpoints = newPlan.getPlan().checkpoints;

    newCheckpoints.forEach(newCheckpoint => {
      const oldCheckpoint = oldCheckpoints.find(c => c.id === newCheckpoint.id);
      if (!oldCheckpoint) {
        differences.addedCheckpoints.push(newCheckpoint);
      } else if (JSON.stringify(oldCheckpoint) !== JSON.stringify(newCheckpoint)) {
        differences.modifiedCheckpoints.push({
          old: oldCheckpoint,
          new: newCheckpoint
        });
      }
    });

    oldCheckpoints.forEach(oldCheckpoint => {
      if (!newCheckpoints.find(c => c.id === oldCheckpoint.id)) {
        differences.removedCheckpoints.push(oldCheckpoint);
      }
    });

    return differences;
  }
}

interface PlanDifferences {
  addedSteps: any[];
  removedSteps: any[];
  modifiedSteps: { old: any; new: any }[];
  addedCheckpoints: any[];
  removedCheckpoints: any[];
  modifiedCheckpoints: { old: any; new: any }[];
}