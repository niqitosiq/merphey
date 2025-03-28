import { scoped, Lifecycle, injectable, autoInjectable } from "tsyringe";

interface TrendAnalysis {
  direction: 'increasing' | 'decreasing' | 'stable';
  volatility: number;
  baselineRisk: number;
}

/**
 * Model for analyzing risk patterns and trends
 * Provides mathematical analysis of risk assessment data
 */

@scoped(Lifecycle.ContainerScoped)
@injectable()
@autoInjectable()
export class RiskModel {
  private readonly TREND_THRESHOLD = 0.1;
  private readonly VOLATILITY_WINDOW = 5;

  /**
   * Analyzes risk score trends to determine direction and volatility
   * @param scores - Array of historical risk scores
   * @returns TrendAnalysis with trend direction, volatility, and baseline
   */
  calculateTrend(scores: number[]): TrendAnalysis {
    if (scores.length < 2) {
      return {
        direction: 'stable',
        volatility: 0,
        baselineRisk: scores[0] || 0.5,
      };
    }

    const baseline = this.calculateBaseline(scores);
    const volatility = this.calculateVolatility(scores);
    const direction = this.determineDirection(scores);

    return {
      direction,
      volatility,
      baselineRisk: baseline,
    };
  }

  /**
   * Calculates the baseline risk level from historical scores
   * Uses exponential weighting to emphasize recent scores
   */
  private calculateBaseline(scores: number[]): number {
    if (scores.length === 0) return 0.5;

    // Use exponential weighting
    let totalWeight = 0;
    let weightedSum = 0;

    scores.forEach((score, index) => {
      const weight = Math.exp(index / scores.length);
      weightedSum += score * weight;
      totalWeight += weight;
    });

    return weightedSum / totalWeight;
  }

  /**
   * Calculates the volatility (variability) of risk scores
   * Higher volatility indicates more unstable risk patterns
   */
  private calculateVolatility(scores: number[]): number {
    const recentScores = scores.slice(-this.VOLATILITY_WINDOW);
    if (recentScores.length < 2) return 0;

    const mean = this.calculateBaseline(recentScores);
    const squaredDiffs = recentScores.map((score) => Math.pow(score - mean, 2));
    const variance = squaredDiffs.reduce((sum, diff) => sum + diff, 0) / recentScores.length;

    // Normalize volatility to 0-1 range
    return Math.min(1, Math.sqrt(variance) * 2);
  }

  /**
   * Determines the direction of risk trend
   * Uses linear regression on recent scores to determine trend
   */
  private determineDirection(scores: number[]): 'increasing' | 'decreasing' | 'stable' {
    const recentScores = scores.slice(-3);
    if (recentScores.length < 2) return 'stable';

    // Calculate linear regression slope
    const n = recentScores.length;
    const indices = Array.from({ length: n }, (_, i) => i);

    const sumX = indices.reduce((sum, x) => sum + x, 0);
    const sumY = recentScores.reduce((sum, y) => sum + y, 0);
    const sumXY = indices.reduce((sum, x, i) => sum + x * recentScores[i], 0);
    const sumXX = indices.reduce((sum, x) => sum + x * x, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);

    if (Math.abs(slope) < this.TREND_THRESHOLD) return 'stable';
    return slope > 0 ? 'increasing' : 'decreasing';
  }

  /**
   * Estimates future risk based on current trends
   * @param scores Recent risk scores
   * @param periodsAhead Number of periods to project
   * @returns Estimated future risk score
   */
  predictFutureRisk(scores: number[], periodsAhead: number = 1): number {
    const trend = this.calculateTrend(scores);

    if (trend.direction === 'stable') {
      return trend.baselineRisk;
    }

    const volatilityFactor = 1 + trend.volatility;
    const directionFactor = trend.direction === 'increasing' ? 1 : -1;
    const changeRate = this.TREND_THRESHOLD * directionFactor * volatilityFactor;

    const predictedRisk = trend.baselineRisk + changeRate * periodsAhead;
    return Math.max(0, Math.min(1, predictedRisk));
  }
}
