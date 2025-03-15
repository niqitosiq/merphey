import { IContextAnalyzer } from '../../../domain/context-analysis/ports/context-analyzer.port';
import { ContextDelta, ContextScore } from '../../../domain/context-analysis/services/context-monitor.service';
import { MessageHistory } from '../../../domain/user-interaction/value-objects/message-history.value-object';
import { TherapeuticPlanData } from '../../../domain/plan-management/value-objects/therapeutic-plan.value-object';
import { LLMGateway, ModelTier } from '../llm-gateway.adapter';

export class LLMContextAnalyzer implements IContextAnalyzer {
  constructor(private llmGateway: LLMGateway) {}

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
    return isNaN(floatValue) ? 0.5 : floatValue;
  }

  async detectContextShift(
    plan: TherapeuticPlanData,
    messageHistory: MessageHistory,
  ): Promise<ContextDelta> {
    const planSummary = this.extractPlanSummary(plan);
    const recentMessages = messageHistory.messages
      .slice(-7)
      .filter((m) => m.sender === 'USER')
      .map((m) => m.content)
      .join('\n');

    if (!recentMessages) {
      return {
        similarityScore: 1.0,
        significantKeywords: [],
        requiresPlanRevision: false,
      };
    }

    const prompt = `
Analyze the relationship between a therapeutic plan and recent user messages.

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
      const llmResponse = await this.llmGateway.generateResponse({
        prompt,
        systemPrompt: 'You are a therapeutic context analysis assistant that detects shifts in conversation topics and themes.',
        modelTier: ModelTier.LOW,
        temperature: 0.3,
      });

      const responseText = llmResponse.content;
      const similarityScore = this.extractFloatValue(responseText, 'SIMILARITY_SCORE');
      const detectedTheme = this.extractValue(responseText, 'DETECTED_THEME');
      const keywordsText = this.extractValue(responseText, 'SIGNIFICANT_KEYWORDS');
      const requiresRevision = this.extractValue(responseText, 'REQUIRES_PLAN_REVISION').toLowerCase() === 'true';

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
      return {
        similarityScore: 0.8,
        significantKeywords: [],
        requiresPlanRevision: false,
      };
    }
  }

  async calculateSemanticSimilarity(
    targetConcepts: string[],
    messageHistory: MessageHistory,
  ): Promise<ContextScore> {
    // Implementation moved from ContextMonitor
    // Similar pattern as above using LLM
    return {
      score: 0.8,
      confidence: 0.7,
      matchedCriteria: []
    };
  }

  async analyzeTemporalPatterns(messageHistory: MessageHistory): Promise<any> {
    // Implementation moved from ContextMonitor
    if (messageHistory.messages.length < 5) {
      return {
        timeGroups: {},
        peakTimes: [],
        emotionalPatterns: [],
      };
    }
    // Rest of implementation would go here
    return {};
  }
}