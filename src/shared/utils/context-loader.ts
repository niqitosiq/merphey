import { ConversationState, Message } from '@prisma/client';
import {
  ConversationContext,
  UserMessage,
} from '../../domain/aggregates/conversation/entities/types';
import { TherapeuticPlan } from '../../domain/aggregates/therapy/entities/TherapeuticPlan';
import { RiskAssessment } from '../../domain/aggregates/conversation/entities/RiskAssessment';

/**
 * Utility class for managing conversation context
 * Helps extract key information from history and build semantic vectors
 */
export class ContextLoader {
  /**
   * Builds a context vector from conversation history and risk assessment
   * @param history - Recent message history
   * @param riskHistory - History of risk assessments
   * @param currentState - Current conversation state
   * @returns string - Encoded context vector with semantic understanding
   */
  buildContextVector(
    history: Message[],
    riskHistory: RiskAssessment[],
    currentState: ConversationState,
  ): string {
    // Extract key themes from conversation history
    const keyThemes = this.extractKeyThemes(history);

    // Analyze risk patterns
    const riskPatterns = this.analyzeRiskPatterns(riskHistory);

    // Extract state-specific context
    const stateContext = this.getStateContext(currentState);

    // Create combined context object
    const contextObject = {
      keyThemes,
      riskPatterns,
      stateContext,
      lastMessages: this.getRecentMessageSummary(history),
      timestamp: new Date().toISOString(),
    };

    // Serialize to string format (could be replaced with vector embedding in production)
    return JSON.stringify(contextObject);
  }

  /**
   * Assembles full conversation context for processing
   * @param conversationId - The conversation identifier
   * @param userId - The user identifier
   * @param currentState - Current conversation state
   * @param messages - Recent conversation messages
   * @param therapeuticPlan - Current therapeutic plan
   * @param riskHistory - Past risk assessments
   * @returns ConversationContext - Complete context for processing
   */
  assembleContext(
    conversationId: string,
    userId: string,
    currentState: ConversationState,
    messages: UserMessage[],
    therapeuticPlan: TherapeuticPlan | undefined,
    riskHistory: RiskAssessment[],
  ): ConversationContext {
    return {
      conversationId,
      userId,
      currentState,
      history: messages,
      riskHistory,
      therapeuticPlan,
    };
  }

  /**
   * Extract key themes from message history
   * @param history - Message history
   * @returns Record of key themes and their relevance scores
   */
  private extractKeyThemes(history: Message[]): Record<string, number> {
    // This would use NLP techniques in production
    // For now, implement a basic keyword extraction

    const themes: Record<string, number> = {};
    const keywords = [
      'anxiety',
      'depression',
      'stress',
      'sleep',
      'relationship',
      'work',
      'family',
      'therapy',
      'medication',
      'exercise',
      'mindfulness',
      'coping',
      'emotions',
      'thoughts',
      'behavior',
    ];

    // Simple keyword counting algorithm
    history.forEach((message) => {
      if (message.role === 'user') {
        const content = message.content.toLowerCase();
        keywords.forEach((keyword) => {
          if (content.includes(keyword)) {
            themes[keyword] = (themes[keyword] || 0) + 1;
          }
        });
      }
    });

    // Normalize scores
    const maxScore = Math.max(...Object.values(themes), 1);
    Object.keys(themes).forEach((key) => {
      themes[key] = themes[key] / maxScore;
    });

    return themes;
  }

  /**
   * Analyze patterns in risk assessment history
   * @param riskHistory - History of risk assessments
   * @returns Analysis of risk patterns
   */
  private analyzeRiskPatterns(riskHistory: RiskAssessment[]): {
    trend: 'increasing' | 'decreasing' | 'stable' | 'fluctuating';
    recentLevel: string;
    factors: string[];
  } {
    if (riskHistory.length === 0) {
      return {
        trend: 'stable',
        recentLevel: 'LOW',
        factors: [],
      };
    }

    // Get recent risk levels to determine trend
    const recentLevels = riskHistory.slice(-5).map((assessment) => assessment.level);
    const mostRecent = riskHistory[riskHistory.length - 1];

    // Calculate trend
    let trend: 'increasing' | 'decreasing' | 'stable' | 'fluctuating' = 'stable';
    if (riskHistory.length >= 3) {
      const scores = riskHistory.slice(-3).map((assessment) => assessment.score);

      const isIncreasing = scores[0] < scores[1] && scores[1] < scores[2];
      const isDecreasing = scores[0] > scores[1] && scores[1] > scores[2];

      if (isIncreasing) {
        trend = 'increasing';
      } else if (isDecreasing) {
        trend = 'decreasing';
      } else {
        trend = 'fluctuating';
      }
    }

    // Collect common risk factors
    const factorCounts: Record<string, number> = {};
    riskHistory.forEach((assessment) => {
      assessment.factors.forEach((factor) => {
        factorCounts[factor] = (factorCounts[factor] || 0) + 1;
      });
    });

    // Get top factors
    const topFactors = Object.entries(factorCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([factor]) => factor);

    return {
      trend,
      recentLevel: mostRecent.level,
      factors: topFactors,
    };
  }

  /**
   * Get specific context information based on conversation state
   * @param state - Current conversation state
   * @returns State-specific context data
   */
  private getStateContext(state: ConversationState): Record<string, any> {
    switch (state) {
      case ConversationState.INFO_GATHERING:
        return {
          focusArea: 'collecting_background',
          promptTypes: ['open_ended', 'clarifying'],
          sessionGoal: 'understand_user_needs',
        };
      case ConversationState.ACTIVE_GUIDANCE:
        return {
          focusArea: 'therapeutic_techniques',
          promptTypes: ['reflective', 'cognitive_reframing'],
          sessionGoal: 'apply_techniques',
        };
      case ConversationState.PLAN_REVISION:
        return {
          focusArea: 'progress_assessment',
          promptTypes: ['evaluative', 'planning'],
          sessionGoal: 'update_therapeutic_approach',
        };
      case ConversationState.EMERGENCY_INTERVENTION:
        return {
          focusArea: 'immediate_safety',
          promptTypes: ['grounding', 'crisis_protocol'],
          sessionGoal: 'ensure_safety',
          urgency: 'high',
        };
      case ConversationState.SESSION_CLOSING:
        return {
          focusArea: 'consolidation',
          promptTypes: ['summarizing', 'reinforcing'],
          sessionGoal: 'cement_insights',
        };
      default:
        return {};
    }
  }

  /**
   * Get a summary of recent messages
   * @param history - Message history
   * @returns Summary of recent interaction
   */
  private getRecentMessageSummary(history: Message[]): Record<string, string> {
    const recentMessages = history.slice(-3);

    const summary: Record<string, string> = {};
    recentMessages.forEach((message, index) => {
      summary[`message_${index + 1}_role`] = message.role;

      // Limit content length for vector efficiency
      const content = message.content;
      summary[`message_${index + 1}_content`] =
        content.length > 100 ? content.substring(0, 97) + '...' : content;
    });

    return summary;
  }
}
