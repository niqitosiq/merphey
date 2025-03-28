import { RiskAssessment } from '../../aggregates/conversation/entities/RiskAssessment'
import { LLMAdapter } from '../../../infrastructure/llm/openai/LLMAdapter'
import { CrisisDetector } from './CrisisDetector'
import { RiskModel } from './RiskModel'
import { v4 } from 'uuid'
import { RiskLevel } from '@prisma/client'
import { scoped, Lifecycle, injectable, autoInjectable } from 'tsyringe'

interface SentimentAnalysis {
	score: number
	mainEmotion: string
	intensity: number
}

interface CrisisIndicators {
	patterns: string[]
	severity: number
	immediateAction: boolean
}

interface RiskTrend {
	direction: 'increasing' | 'decreasing' | 'stable'
	volatility: number
	baseline: number
}

/**
 * Domain service responsible for evaluating psychological risk in user messages
 * Core risk evaluation logic for the mental health application
 */

@scoped(Lifecycle.ContainerScoped)
@injectable()
@autoInjectable()
export class RiskAssessor {
	constructor(
		private llmService: LLMAdapter,
		private crisisDetector: CrisisDetector,
		private riskModel: RiskModel
	) {}

	/**
	 * Analyzes a message for immediate psychological risk factors
	 * @param message - The content of the user message
	 * @param history - Previous risk assessments for context
	 * @returns RiskAssessment - Contains risk level, factors, and score
	 */
	async detectImmediateRisk(
		message: string,
		history: RiskAssessment[]
	): Promise<RiskAssessment> {
		// 1. Use NLP service for sentiment and emotion analysis
		const sentiment = await this.analyzeSentiment(message)

		// 2. Pattern matching for crisis keywords and phrases
		const crisisIndicators = await this.detectCrisisPatterns(message)

		// 3. Historical risk trend analysis
		const riskTrend = this.analyzeRiskTrend(history)

		// 4. Composite risk evaluation
		const { level, score } = this.evaluateCompositeRisk(
			sentiment,
			crisisIndicators,
			riskTrend
		)

		// 5. Create and return risk assessment entity
		return new RiskAssessment(
			v4(),
			level,
			this.determineRiskFactors(sentiment, crisisIndicators),
			score,
			new Date()
		)
	}

	private async analyzeSentiment(
		message: string
	): Promise<SentimentAnalysis> {
		const prompt = `Analyze the sentiment and emotion in this message: "${message}"
    Return only JSON formatted:
    {
      "score": number between 0-1 (0 being most negative, 1 being most positive),
      "primaryEmotion": string,
      "emotionalIntensity": number between 0-1,
      "reason": "..."
    }`

		const response = await this.llmService.generateCompletion(prompt, {
			model: 'google/gemini-2.0-flash-001',
		})
		const analysis = JSON.parse(response)

		return {
			score: analysis.score,
			mainEmotion: analysis.primaryEmotion,
			intensity: analysis.emotionalIntensity,
		}
	}

	private async detectCrisisPatterns(
		message: string
	): Promise<CrisisIndicators> {
		const patterns = await this.crisisDetector.scanForRiskPatterns(message)
		return {
			patterns: patterns.identifiedPatterns,
			severity: patterns.overallSeverity,
			immediateAction: patterns.requiresImmediateAction,
		}
	}

	private analyzeRiskTrend(history: RiskAssessment[]): RiskTrend {
		if (history.length < 2) {
			return { direction: 'stable', volatility: 0, baseline: 0.5 }
		}

		const recentScores = history.slice(-5).map((h) => h.score)
		const trend = this.riskModel.calculateTrend(recentScores)

		return {
			direction: trend.direction,
			volatility: trend.volatility,
			baseline: trend.baselineRisk,
		}
	}

	private evaluateCompositeRisk(
		sentiment: SentimentAnalysis,
		crisis: CrisisIndicators,
		trend: RiskTrend
	): { level: RiskLevel; score: number } {
		// Immediate crisis indicators take precedence
		if (crisis.immediateAction) {
			return {
				level: RiskLevel.CRITICAL,
				score: 0.9 + crisis.severity * 0.1,
			}
		}

		// Calculate weighted risk score
		const baseScore = this.calculateBaseRiskScore(sentiment, crisis, trend)

		// Consider trend adjustments
		let adjustedScore = baseScore
		if (trend.direction === 'increasing' && trend.volatility > 0.3) {
			adjustedScore = Math.min(1, baseScore * (1 + trend.volatility))
		}

		// Factor in crisis severity for borderline cases
		if (crisis.severity > 0.7 && adjustedScore > 0.5) {
			adjustedScore = Math.min(1, adjustedScore + crisis.severity * 0.2)
		}

		// Determine risk level based on adjusted score
		return {
			level: this.mapScoreToRiskLevel(adjustedScore),
			score: adjustedScore,
		}
	}

	private calculateBaseRiskScore(
		sentiment: SentimentAnalysis,
		crisis: CrisisIndicators,
		trend: RiskTrend
	): number {
		const weights = {
			sentiment: 0.3,
			crisis: 0.4,
			trend: 0.3,
		}

		const sentimentScore = (1 - sentiment.score) * sentiment.intensity
		const crisisScore = crisis.severity
		const trendScore =
			trend.direction === 'increasing'
				? trend.baseline + trend.volatility
				: trend.baseline - trend.volatility

		return (
			sentimentScore * weights.sentiment +
			crisisScore * weights.crisis +
			trendScore * weights.trend
		)
	}

	private mapScoreToRiskLevel(score: number): RiskLevel {
		if (score >= 0.8) return RiskLevel.CRITICAL
		if (score >= 0.6) return RiskLevel.HIGH
		if (score >= 0.4) return RiskLevel.MEDIUM
		return RiskLevel.LOW
	}

	private determineRiskFactors(
		sentiment: SentimentAnalysis,
		crisis: CrisisIndicators
	): string[] {
		const factors: string[] = []

		// Add sentiment-based factors
		if (sentiment.intensity > 0.7) {
			factors.push(`high_emotional_intensity`)
			factors.push(`emotion_${sentiment.mainEmotion.toLowerCase()}`)
		}

		// Add crisis pattern factors
		factors.push(...crisis.patterns)

		return factors
	}
}
