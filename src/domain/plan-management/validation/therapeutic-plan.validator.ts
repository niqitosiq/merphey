import { TherapeuticPlanData } from '../value-objects/therapeutic-plan.value-object';

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
}

export interface ValidationError {
  field: string;
  message: string;
  code: string;
}

export interface ValidationRule {
  validate(plan: TherapeuticPlanData): ValidationError[];
}

export class StepOrderValidationRule implements ValidationRule {
  validate(plan: TherapeuticPlanData): ValidationError[] {
    const errors: ValidationError[] = [];
    
    if (!plan.steps || plan.steps.length === 0) {
      errors.push({
        field: 'steps',
        message: 'Plan must contain at least one step',
        code: 'EMPTY_STEPS'
      });
      return errors;
    }

    // Validate step order
    const hasInvalidOrder = plan.steps.some((step, index) => 
      step.order !== index + 1
    );

    if (hasInvalidOrder) {
      errors.push({
        field: 'steps',
        message: 'Step order must be sequential',
        code: 'INVALID_STEP_ORDER'
      });
    }

    return errors;
  }
}

export class CheckpointValidationRule implements ValidationRule {
  validate(plan: TherapeuticPlanData): ValidationError[] {
    const errors: ValidationError[] = [];
    
    // Ensure checkpoints exist
    if (!plan.checkpoints || plan.checkpoints.length === 0) {
      errors.push({
        field: 'checkpoints',
        message: 'Plan must contain assessment checkpoints',
        code: 'NO_CHECKPOINTS'
      });
      return errors;
    }

    // Validate checkpoint coverage
    const lastStep = Math.max(...plan.steps.map(s => s.order));
    const hasLateCheckpoint = plan.checkpoints.some(c => 
      c.afterStep >= lastStep
    );

    if (!hasLateCheckpoint) {
      errors.push({
        field: 'checkpoints',
        message: 'Plan must include a final assessment checkpoint',
        code: 'NO_FINAL_CHECKPOINT'
      });
    }

    return errors;
  }
}

export class TherapeuticPlanValidator {
  private rules: ValidationRule[] = [];

  constructor() {
    // Register default validation rules
    this.rules.push(
      new StepOrderValidationRule(),
      new CheckpointValidationRule()
    );
  }

  addRule(rule: ValidationRule): void {
    this.rules.push(rule);
  }

  validate(plan: TherapeuticPlanData): ValidationResult {
    const errors = this.rules.flatMap(rule => 
      rule.validate(plan)
    );

    return {
      isValid: errors.length === 0,
      errors
    };
  }
}