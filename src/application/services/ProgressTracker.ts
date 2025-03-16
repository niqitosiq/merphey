import {
  ConversationContext,
  ProcessingResult,
  SessionResponse,
  TherapeuticResponse,
  SessionProgress,
  UserMessage,
  SessionStats,
  ProgressInsights,
} from '../../domain/aggregates/conversation/entities/types';

/**
 * Application service for measuring therapeutic progress in sessions
 * Responsible for calculating session metrics and tracking engagement
 */
export class ProgressTracker {
  private readonly engagementThresholds = {
    HIGH: 0.8,
    MEDIUM: 0.5,
    LOW: 0.3,
  };

  /**
   * Calculates therapeutic progress metrics for the current session
   * @param history - Conversation history
   * @param response - Current therapeutic response
   * @returns SessionProgress - Progress metrics for the session
   */
  calculateSessionMetrics(history: UserMessage[], response: TherapeuticResponse): SessionProgress {
    // Calculate engagement based on user message patterns
    const engagementScore = this.calculateEngagementScore(history);
    const engagementLevel = this.determineEngagementLevel(engagementScore);

    // Identify breakthroughs from response insights and history
    const breakthroughs = this.identifyBreakthroughs(history, response);

    // Track ongoing challenges from response analysis
    const challenges = this.identifyChallenges(history, response);

    // Calculate overall progress score
    const score = this.calculateProgressScore(engagementScore, breakthroughs, challenges);

    return {
      score,
      engagementLevel,
      breakthroughs,
      challenges,
    };
  }

  /**
   * Calculates user engagement score based on message patterns
   */
  private calculateEngagementScore(history: UserMessage[]): number {
    if (!history.length) return 0;

    const Messages = history.filter((msg) => msg.role === 'user');
    if (!Messages.length) return 0;

    // Factors that indicate engagement:
    // 1. Message length and detail
    const avgMessageLength =
      Messages.reduce((sum, msg) => sum + msg.content.length, 0) / Messages.length;
    const lengthScore = Math.min(avgMessageLength / 100, 1); // Normalize to 0-1

    // 2. Response time patterns (if timestamps available)
    const timeScore = this.calculateTimeScore(Messages);

    // 3. Therapeutic technique adoption (from message metadata)
    const techniqueScore = this.calculateTechniqueAdoptionScore(Messages);

    // Weighted average of engagement factors
    return lengthScore * 0.4 + timeScore * 0.3 + techniqueScore * 0.3;
  }

  /**
   * Determines engagement level based on score
   */
  private determineEngagementLevel(score: number): string {
    if (score >= this.engagementThresholds.HIGH) return 'HIGH';
    if (score >= this.engagementThresholds.MEDIUM) return 'MEDIUM';
    if (score >= this.engagementThresholds.LOW) return 'LOW';
    return 'MINIMAL';
  }

  /**
   * Identifies breakthrough moments from conversation
   */
  private identifyBreakthroughs(history: UserMessage[], response: TherapeuticResponse): string[] {
    const breakthroughs: string[] = [];

    // Check response insights for breakthrough indicators
    if (response.insights) {
      if (response.insights.positiveProgress) {
        breakthroughs.push(response.insights.positiveProgress);
      }
      if (response.insights.techniqueAdoption) {
        breakthroughs.push(`Successfully adopted ${response.insights.techniqueAdoption}`);
      }
    }

    // Analyze recent message patterns for breakthroughs
    const recentMessages = history.slice(-5);
    for (const msg of recentMessages) {
      if (msg.metadata?.breakthrough) {
        breakthroughs.push(msg.metadata.breakthrough);
      }
    }

    return breakthroughs;
  }

  /**
   * Identifies ongoing challenges from conversation
   */
  private identifyChallenges(history: UserMessage[], response: TherapeuticResponse): string[] {
    const challenges: string[] = [];

    // Extract challenges from response insights
    if (response.insights?.challenges) {
      challenges.push(...response.insights.challenges);
    }

    // Analyze message metadata for challenge indicators
    const recentMessages = history.slice(-5);
    for (const msg of recentMessages) {
      if (msg.metadata?.challenges) {
        challenges.push(...msg.metadata.challenges);
      }
    }

    return [...new Set(challenges)]; // Remove duplicates
  }

  /**
   * Calculates time-based engagement score
   */
  private calculateTimeScore(messages: UserMessage[]): number {
    if (messages.length < 2) return 0.5; // Neutral score for short conversations

    let timeScore = 0;
    const timestamps = messages
      .filter((msg) => msg.metadata?.timestamp)
      .map((msg) => msg.metadata!.timestamp);

    if (timestamps.length < 2) return 0.5;

    // Calculate average response time
    let totalGaps = 0;
    for (let i = 1; i < timestamps.length; i++) {
      if (timestamps[i] !== undefined && timestamps[i - 1] !== undefined) {
        totalGaps += timestamps[i]! - timestamps[i - 1]!;
      }
    }
    const avgGap = totalGaps / (timestamps.length - 1);

    // Score based on consistency and responsiveness
    // Lower gaps = higher engagement (up to a reasonable minimum)
    timeScore = Math.min(1, 300000 / avgGap); // 5 minutes as baseline
    return timeScore;
  }

  /**
   * Calculates score based on therapeutic technique adoption
   */
  private calculateTechniqueAdoptionScore(messages: UserMessage[]): number {
    let techniqueScore = 0;
    let techniquesAttempted = 0;

    for (const msg of messages) {
      if (msg.metadata?.techniqueAttempted) {
        techniquesAttempted++;
      }
    }

    if (messages.length > 0) {
      techniqueScore = techniquesAttempted / messages.length;
    }

    return Math.min(1, techniqueScore); // Normalize to 0-1
  }

  /**
   * Calculates overall progress score
   */
  private calculateProgressScore(
    engagementScore: number,
    breakthroughs: string[],
    challenges: string[],
  ): number {
    // Weight factors for final score
    const weights = {
      engagement: 0.4,
      breakthroughs: 0.4,
      challenges: 0.2,
    };

    const breakthroughScore = Math.min(breakthroughs.length / 3, 1); // Normalize to 0-1
    const challengeImpact = Math.max(0, 1 - challenges.length / 5); // Inverse score, more challenges = lower score

    return (
      engagementScore * weights.engagement +
      breakthroughScore * weights.breakthroughs +
      challengeImpact * weights.challenges
    );
  }

  /**
   * Gets statistics for the current session
   * @param context - Current conversation context
   * @returns Promise<SessionStats>
   */
  async getSessionStats(context: ConversationContext): Promise<SessionStats> {
    const userMessages = context.history.filter((msg) => msg.role === 'user');
    const duration = this.calculateSessionDuration(context.history);

    return {
      totalMessages: userMessages.length,
      duration,
      engagementScore: this.calculateEngagementScore(context.history),
      techniqueAdoption: this.calculateTechniqueAdoptionScore(context.history),
    };
  }

  /**
   * Gets insights about the therapeutic progress
   * @param context - Current conversation context
   * @returns Promise<ProgressInsights>
   */
  async getProgressInsights(context: ConversationContext): Promise<ProgressInsights> {
    const therapeuticResponse = context.history
      .filter((msg) => msg.role === 'assistant')
      .find((msg) => msg.metadata?.insights) as unknown as TherapeuticResponse;

    return {
      recentInsights: therapeuticResponse?.insights?.positiveProgress
        ? [therapeuticResponse.insights.positiveProgress]
        : [],
      breakthroughs: this.identifyBreakthroughs(
        context.history,
        therapeuticResponse || {
          content: '',
          insights: { positiveProgress: '', techniqueAdoption: '', challenges: [] },
        },
      ),
      challenges: this.identifyChallenges(
        context.history,
        therapeuticResponse || {
          content: '',
          insights: { positiveProgress: '', techniqueAdoption: '', challenges: [] },
        },
      ),
    };
  }

  private calculateSessionDuration(history: UserMessage[]): number {
    if (history.length < 2) return 0;
    const firstMessage = history[0];
    const lastMessage = history[history.length - 1];
    return lastMessage.createdAt.getTime() - firstMessage.createdAt.getTime();
  }
}

/**
 * Application service for composing final response packages
 * Formats therapeutic responses for delivery to the user interface
 */
export class ResponseComposer {
  /**
   * Creates a complete response package for the user interface
   * @param processingResult - Result of message processing pipeline
   * @param context - Updated conversation context
   * @returns SessionResponse - Final formatted response package
   */
  createResponsePackage(
    processingResult: ProcessingResult,
    context: ConversationContext,
  ): SessionResponse {
    return {
      message: processingResult.therapeuticResponse.content,
      metadata: {
        state: context.currentState,
        riskLevel: processingResult.riskAssessment.level,
        suggestedTechniques: processingResult.therapeuticResponse.suggestedTechniques,
        progressMetrics: {
          score: processingResult.sessionProgress.score,
          insights: processingResult.sessionProgress.breakthroughs,
        },
      },
    };
  }
}
