/**
 * ContextMonitor Service - Analyzes conversation context using LLM
 * Detects shifts in conversation themes and semantic meaning
 */

import { TherapeuticPlanData } from '../../plan-management/value-objects/therapeutic-plan.value-object';
import { MessageHistory } from '../../user-interaction/value-objects/message-history.value-object';
import { IContextAnalyzer } from '../ports/context-analyzer.port';

export interface ContextDelta {
  similarityScore: number; // 0-1 score of semantic similarity
  detectedTheme?: string;
  significantKeywords: string[];
  requiresPlanRevision: boolean;
}

export interface ContextScore {
  score: number; // 0-1 with 1 being perfectly aligned
  confidence: number; // 0-1 with 1 being highest confidence
  matchedCriteria: string[];
}

export class ContextMonitor {
  constructor(private contextAnalyzer: IContextAnalyzer) {}

  /**
   * Detect shifts in conversation context compared to current plan using LLM
   * @param plan Current therapeutic plan
   * @param messageHistory Recent message history
   */
  async detectContextShift(
    plan: TherapeuticPlanData,
    messageHistory: MessageHistory,
  ): Promise<ContextDelta> {
    return this.contextAnalyzer.detectContextShift(plan, messageHistory);
  }

  /**
   * Calculate semantic similarity between conversation and target concepts using LLM
   * @param targetConcepts Concepts to measure against
   * @param messageHistory Recent message history
   */
  async calculateSemanticSimilarity(
    targetConcepts: string[],
    messageHistory: MessageHistory,
  ): Promise<ContextScore> {
    return this.contextAnalyzer.calculateSemanticSimilarity(targetConcepts, messageHistory);
  }

  /**
   * Analyze temporal patterns in conversation using LLM
   * @param messageHistory Message history to analyze
   */
  async analyzeTemporalPatterns(messageHistory: MessageHistory): Promise<any> {
    return this.contextAnalyzer.analyzeTemporalPatterns(messageHistory);
  }
}
