/**
 * RiskLevel Value Object - Implements 4-tier risk classification system
 */

export enum RiskLevel {
  LOW = 'LOW', // No significant risk detected
  MODERATE = 'MODERATE', // Some concerning patterns, monitor closely
  HIGH = 'HIGH', // Clear risk indicators, intervention needed
  CRITICAL = 'CRITICAL', // Immediate action required, emergency protocol activation
}

export interface RiskSpectrum {
  level: RiskLevel;
  score: number; // Numerical score (0-100)
  indicators: string[]; // List of detected risk indicators
  lastAssessedAt: Date;
  requiresEscalation: boolean;
}

export const riskThresholds = {
  LOW: { min: 0, max: 25 },
  MODERATE: { min: 26, max: 50 },
  HIGH: { min: 51, max: 75 },
  CRITICAL: { min: 76, max: 100 },
};
