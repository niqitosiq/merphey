import { RiskLevel } from "@prisma/client";

/**
 * Domain entity representing a risk assessment for a user message
 * Responsible for encapsulating risk evaluation data and providing business logic
 * for determining appropriate responses based on risk level
 */
export class RiskAssessment {
  /**
   * Creates a new risk assessment
   * @param id - Unique identifier
   * @param level - Assessed risk level
   * @param factors - Risk factors identified
   * @param score - Numerical risk score
   * @param timestamp - When the assessment was created
   */
  constructor(
    public readonly id: string,
    public readonly level: RiskLevel,
    public readonly factors: string[],
    public readonly score: number,
    public readonly timestamp: Date = new Date(),
    public readonly conversationId?: string,
    public readonly createdAt: Date = new Date(),
  ) {}

  /**
   * Determines if immediate intervention is required
   * @returns boolean indicating if this risk level requires immediate intervention
   */
  requiresImmediateIntervention(): boolean {
    // Critical risk level always requires immediate intervention
    if (this.level === RiskLevel.CRITICAL) {
      return true;
    }

    // Check for specific high-severity risk factors
    const criticalFactors = [
      'suicidal_ideation',
      'self_harm',
      'violence_threat',
      'immediate_crisis',
    ];

    return (
      this.level === RiskLevel.HIGH &&
      this.score >= 0.8 &&
      this.factors.some((factor) => criticalFactors.includes(factor))
    );
  }

  /**
   * Determines if a human moderator should be notified
   * @returns boolean indicating if a human should be notified
   */
  requiresHumanModeration(): boolean {
    // Always notify for critical and high risk
    if (this.level === RiskLevel.CRITICAL || this.level === RiskLevel.HIGH) {
      return true;
    }

    // Check for specific concerning patterns
    const moderationFactors = [
      'emotional_distress',
      'isolation',
      'substance_abuse',
      'relationship_crisis',
    ];

    return (
      this.level === RiskLevel.MEDIUM &&
      this.factors.some((factor) => moderationFactors.includes(factor))
    );
  }

  /**
   * Compares the severity with another assessment
   * @param other - Another risk assessment to compare with
   * @returns number - Positive if this assessment is more severe
   */
  compareSeverity(other: RiskAssessment): number {
    // First compare risk levels by severity
    const levelComparison =
      this.getRiskLevelWeight(this.level) - this.getRiskLevelWeight(other.level);

    if (levelComparison !== 0) {
      return levelComparison;
    }

    // If levels are the same, compare numerical scores
    return this.score - other.score;
  }

  /**
   * Creates a data object suitable for persistence
   */
  toJSON() {
    return {
      id: this.id,
      level: this.level,
      factors: this.factors,
      score: this.score,
      timestamp: this.timestamp.toISOString(),
      conversationId: this.conversationId,
      createdAt: this.createdAt.toISOString(),
    };
  }

  /**
   * Creates a risk assessment from a data object (for reconstruction from database)
   * @param data Risk assessment data from persistence
   */
  static fromJSON(data: any): RiskAssessment {
    if (!data.id || !data.level || !data.score) {
      throw new Error('Invalid risk assessment data');
    }

    return new RiskAssessment(
      data.id,
      data.level as RiskLevel,
      data.factors || [],
      data.score,
      new Date(data.timestamp || data.createdAt),
      data.conversationId,
      new Date(data.createdAt || data.timestamp),
    );
  }

  private getRiskLevelWeight(level: RiskLevel): number {
    const weights: Record<RiskLevel, number> = {
      [RiskLevel.CRITICAL]: 4,
      [RiskLevel.HIGH]: 3,
      [RiskLevel.MEDIUM]: 2,
      [RiskLevel.LOW]: 1,
    };
    return weights[level];
  }
}
