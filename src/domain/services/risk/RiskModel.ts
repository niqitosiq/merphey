interface TrendAnalysis {
  direction: 'increasing' | 'decreasing' | 'stable';
  volatility: number;
  baselineRisk: number;
}

export class RiskModel {
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

  private calculateBaseline(scores: number[]): number {
    return scores.reduce((sum, score) => sum + score, 0) / scores.length;
  }

  private calculateVolatility(scores: number[]): number {
    const mean = this.calculateBaseline(scores);
    const squaredDiffs = scores.map((score) => Math.pow(score - mean, 2));
    return Math.sqrt(squaredDiffs.reduce((sum, diff) => sum + diff, 0) / scores.length);
  }

  private determineDirection(scores: number[]): 'increasing' | 'decreasing' | 'stable' {
    const recentScores = scores.slice(-3);
    if (recentScores.length < 2) return 'stable';

    const trend = recentScores[recentScores.length - 1] - recentScores[0];
    const threshold = 0.1;

    if (trend > threshold) return 'increasing';
    if (trend < -threshold) return 'decreasing';
    return 'stable';
  }
}
