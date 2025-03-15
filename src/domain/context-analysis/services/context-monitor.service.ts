/**
 * ContextMonitor Service - Analyzes conversation context using LLM
 * Detects shifts in conversation themes and semantic meaning
 */

import { TherapeuticPlanData } from '../../plan-management/value-objects/therapeutic-plan.value-object';
import { MessageHistory } from '../../user-interaction/value-objects/message-history.value-object';
import { LLMGateway, ModelTier } from '../../../infrastructure/llm-integration/llm-gateway.adapter';

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
  constructor(private llmGateway: LLMGateway) {}

  /**
   * Detect shifts in conversation context compared to current plan using LLM
   * @param plan Current therapeutic plan
   * @param messageHistory Recent message history
   */
  async detectContextShift(
    plan: TherapeuticPlanData,
    messageHistory: MessageHistory,
  ): Promise<ContextDelta> {
    // Extract plan information for context
    const planSummary = this.extractPlanSummary(plan);

    // Extract recent messages for analysis
    const recentMessages = messageHistory.messages
      .slice(-7)
      .filter((m) => m.sender === 'USER')
      .map((m) => m.content)
      .join('\n');

    if (!recentMessages) {
      return {
        similarityScore: 1.0, // No messages means no shift
        significantKeywords: [],
        requiresPlanRevision: false,
      };
    }

    // Create prompt for context analysis
    const prompt = `
Analyze the relationship between a therapeutic plan and recent user messages.
Detect if there's a significant context shift that might require plan adjustment.

THERAPEUTIC PLAN SUMMARY:
${planSummary}

RECENT USER MESSAGES:
${recentMessages}

Based on this information, analyze:
1. The semantic similarity between plan focus and conversation topics (0.0-1.0)
2. The primary theme detected in recent messages
3. Key concepts/keywords from the messages that differ from the plan
4. Whether a plan revision is needed (true/false)

Respond with:
SIMILARITY_SCORE: [number between 0.0-1.0]
DETECTED_THEME: [primary theme]
SIGNIFICANT_KEYWORDS: [comma-separated keywords]
REQUIRES_PLAN_REVISION: [true or false]
REASONING: [brief explanation of your analysis]
`;

    try {
      // Use LLM to analyze context
      const llmResponse = await this.llmGateway.generateResponse({
        prompt,
        systemPrompt:
          'You are a therapeutic context analysis assistant that detects shifts in conversation topics and themes.',
        modelTier: ModelTier.LOW, // Lower tier model is sufficient for context analysis
        temperature: 0.3,
      });

      // Parse the LLM response
      const responseText = llmResponse.content;

      const similarityScore = this.extractFloatValue(responseText, 'SIMILARITY_SCORE');
      const detectedTheme = this.extractValue(responseText, 'DETECTED_THEME');
      const keywordsText = this.extractValue(responseText, 'SIGNIFICANT_KEYWORDS');
      const requiresRevision =
        this.extractValue(responseText, 'REQUIRES_PLAN_REVISION').toLowerCase() === 'true';

      // Process keywords
      const significantKeywords = keywordsText
        .split(',')
        .map((keyword) => keyword.trim())
        .filter((keyword) => keyword.length > 0);

      return {
        similarityScore,
        detectedTheme,
        significantKeywords,
        requiresPlanRevision: requiresRevision,
      };
    } catch (error) {
      console.error('Error during context analysis:', error);

      // Conservative fallback assuming no context shift in case of failure
      return {
        similarityScore: 0.8,
        significantKeywords: [],
        requiresPlanRevision: false,
      };
    }
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
    // Extract recent messages
    const recentMessages = messageHistory.messages
      .slice(-5)
      .filter((m) => m.sender === 'USER')
      .map((m) => m.content)
      .join('\n');

    if (!recentMessages || !targetConcepts.length) {
      return {
        score: 0,
        confidence: 0,
        matchedCriteria: [],
      };
    }

    // Create prompt for semantic similarity analysis
    const prompt = `
Analyze the semantic similarity between specific target concepts and recent conversation messages.

TARGET CONCEPTS:
${targetConcepts.join(', ')}

RECENT MESSAGES:
${recentMessages}

Calculate how closely the messages align with the target concepts and identify which specific concepts are matched.

Respond with:
SIMILARITY_SCORE: [number between 0.0-1.0]
CONFIDENCE_SCORE: [number between 0.0-1.0 representing certainty]
MATCHED_CRITERIA: [comma-separated list of matched concepts]
`;

    try {
      const llmResponse = await this.llmGateway.generateResponse({
        prompt,
        systemPrompt:
          'You are a semantic analysis assistant that evaluates the similarity between concepts.',
        modelTier: ModelTier.LOW,
        temperature: 0.2,
      });

      // Parse the LLM response
      const responseText = llmResponse.content;

      const score = this.extractFloatValue(responseText, 'SIMILARITY_SCORE');
      const confidence = this.extractFloatValue(responseText, 'CONFIDENCE_SCORE');
      const matchedText = this.extractValue(responseText, 'MATCHED_CRITERIA');

      // Process matched criteria
      const matchedCriteria = matchedText
        .split(',')
        .map((criterion) => criterion.trim())
        .filter((criterion) => criterion.length > 0);

      return {
        score,
        confidence,
        matchedCriteria,
      };
    } catch (error) {
      console.error('Error during semantic similarity analysis:', error);

      return {
        score: 0.5, // Neutral score in case of failure
        confidence: 0.1, // Low confidence due to error
        matchedCriteria: [],
      };
    }
  }

  /**
   * Analyze temporal patterns in conversation using LLM
   * @param messageHistory Message history to analyze
   */
  async analyzeTemporalPatterns(messageHistory: MessageHistory): Promise<any> {
    // Only perform analysis if we have enough messages
    if (messageHistory.messages.length < 5) {
      return {
        timeGroups: {},
        peakTimes: [],
        emotionalPatterns: [],
      };
    }

    // Format message history for temporal analysis
    const formattedHistory = messageHistory.messages
      .map((m) => `[${m.timestamp.toISOString()}] ${m.sender}: ${m.content}`)
      .join('\n');

    const prompt = `
Analyze the temporal patterns in this message history:

${formattedHistory}

Identify:
1. Peak times of conversation activity
2. Emotional patterns associated with different times
3. Any recurring temporal patterns in the conversation flow

Respond with:
PEAK_TIMES: [comma-separated time periods]
EMOTIONAL_PATTERNS: [JSON array of {time, dominantEmotion}]
RECURRING_PATTERNS: [description of identified patterns]
`;

    try {
      const llmResponse = await this.llmGateway.generateResponse({
        prompt,
        systemPrompt:
          'You are an analytical assistant that identifies patterns in conversation timing and emotional flow.',
        modelTier: ModelTier.LOW,
        temperature: 0.3,
      });

      // For simplicity, return the LLM analysis without extensive parsing
      // In a full implementation, this would be parsed into a structured format
      return {
        llmAnalysis: llmResponse.content,
        raw: llmResponse,
      };
    } catch (error) {
      console.error('Error during temporal pattern analysis:', error);

      return {
        error: 'Temporal analysis failed',
        timeGroups: {},
        peakTimes: [],
        emotionalPatterns: [],
      };
    }
  }

  // Helper methods
  private extractPlanSummary(plan: TherapeuticPlanData): string {
    const targetOutcomes = plan.targetOutcomes.join('\n- ');

    const steps = plan.steps.map((step) => `- ${step.title}: ${step.description}`).join('\n');

    return `Target Outcomes:\n- ${targetOutcomes}\n\nPlan Steps:\n${steps}`;
  }

  private extractValue(text: string, key: string): string {
    const regex = new RegExp(`${key}:\\s*(.+)(?:\n|$)`);
    const match = text.match(regex);
    return match ? match[1].trim() : '';
  }

  private extractFloatValue(text: string, key: string): number {
    const value = this.extractValue(text, key);
    const floatValue = parseFloat(value);
    return isNaN(floatValue) ? 0.5 : floatValue; // Default to 0.5 if parsing fails
  }
}
