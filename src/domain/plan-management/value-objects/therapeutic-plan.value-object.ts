/**
 * TherapeuticPlan Value Objects - Core structures for therapeutic intervention plans
 */

import { UUID } from 'crypto';

export enum PlanStepType {
  ASSESSMENT = 'ASSESSMENT',
  EDUCATION = 'EDUCATION',
  EXERCISE = 'EXERCISE',
  REFLECTION = 'REFLECTION',
  COPING_STRATEGY = 'COPING_STRATEGY',
  CRISIS_RESPONSE = 'CRISIS_RESPONSE',
}

export interface PlanStep {
  id: string;
  type: PlanStepType;
  title: string;
  description: string;
  estimatedTimeMinutes: number;
  prerequisiteStepIds?: string[];
  resources?: string[];
  suggestedPrompts?: string[];
}

export interface Checkpoint {
  id: string;
  stepId: string;
  description: string;
  validationCriteria: string[];
  isCompleted: boolean;
  completedAt?: Date;
}

export interface TherapeuticPlanData {
  id: UUID;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  steps: PlanStep[];
  checkpoints: Checkpoint[];
  effectivenessScore?: number;
  targetOutcomes: string[];
  previousVersionId?: string;
}
