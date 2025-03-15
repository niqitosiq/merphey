/**
 * RiskAssessmentService - Handles risk detection and emergency protocols
 * Uses LLM for sentiment analysis and risk assessment
 */

import { MessageHistory } from '../../user-interaction/value-objects/message-history.value-object';
import { User } from '../../user-interaction/entities/user.entity';
import { RiskLevel, RiskSpectrum } from '../value-objects/risk-level.value-object';
import { LLMGateway, ModelTier } from '../../../infrastructure/llm-integration/llm-gateway.adapter';

export interface EmergencyResponse {
  escalationTrigger: string;
  recommendedAction: string;
  isHandled: boolean;
  timestamp: Date;
}

export class RiskAssessor {
  constructor(private llmGateway: LLMGateway) {}

  /**
   * Detect patterns of escalation in message history using LLM
   * @param history The user's message history
   * @returns Risk spectrum assessment
   */
  async detectEscalationPatterns(history: MessageHistory): Promise<RiskSpectrum> {
    if (!history.messages.length) {
      return this.createDefaultRiskSpectrum();
    }

    // Get recent messages for analysis
    const recentMessages = history.messages
      .slice(-10)
      .map((m) => `${m.sender}: ${m.content}`)
      .join('\n');

    // Build LLM prompt for risk assessment
    const prompt = `
You are a specialized AI therapist trained to detect potential signs of distress, self-harm, or suicide risk.
Analyze the following conversation and assess the risk level objectively.

CONVERSATION:
${recentMessages}

Based on this conversation, analyze the following risk factors:
1. References to self-harm or suicide
2. Expressions of hopelessness
3. Crisis language or urgency
4. Emotional distress indicators
5. Methods or planning mentions

Respond with:
RISK_SCORE: [A number between 0-100]
RISK_LEVEL: [LOW, MODERATE, HIGH, or CRITICAL]
INDICATORS: [List the specific risk indicators detected, if any]
REQUIRES_ESCALATION: [true or false]
REASONING: [Brief explanation for your assessment]
`;

    try {
      // Use higher tier model for risk assessment for reliability
      const llmResponse = await this.llmGateway.generateResponse({
        prompt,
        systemPrompt:
          'You are a clinical risk assessment assistant that evaluates mental health conversations for risk factors.',
        modelTier: ModelTier.HIGH,
        temperature: 0.2, // Low temperature for more consistent, conservative assessment
      });

      // Parse the LLM response to extract structured data
      const responseText = llmResponse.content;

      const riskScore = this.extractValue(responseText, 'RISK_SCORE');
      const riskLevel = this.extractValue(responseText, 'RISK_LEVEL');
      const indicatorsText = this.extractValue(responseText, 'INDICATORS');
      const requiresEscalation =
        this.extractValue(responseText, 'REQUIRES_ESCALATION').toLowerCase() === 'true';

      // Process score and level
      const score = parseInt(riskScore) || 0;
      const level = this.validateRiskLevel(riskLevel);

      // Process indicators
      const indicators = indicatorsText
        .split(',')
        .map((indicator) => indicator.trim())
        .filter((indicator) => indicator.length > 0);

      return {
        level,
        score,
        indicators,
        lastAssessedAt: new Date(),
        requiresEscalation,
      };
    } catch (error) {
      console.error('Error during LLM risk assessment:', error);

      // Fallback to conservative assessment in case of failure
      return {
        level: RiskLevel.MODERATE, // Default to MODERATE as a safety measure
        score: 50,
        indicators: ['Risk assessment failed, defaulting to cautious evaluation'],
        lastAssessedAt: new Date(),
        requiresEscalation: false,
      };
    }
  }

  /**
   * Execute emergency protocol for high-risk situations
   * @param user The current user
   * @returns Emergency response details
   */
  async executeEmergencyProtocol(user: User): Promise<EmergencyResponse> {
    // Log the emergency situation
    console.warn(`EMERGENCY PROTOCOL ACTIVATED for user ${user.id}`);

    // Use LLM to generate appropriate crisis response
    const prompt = `
Generate a compassionate crisis response for a user who may be at risk of self-harm or suicide.
The response should:
1. Express concern and validate their feelings
2. Encourage them to seek immediate help
3. Provide clear crisis resources
4. Be direct but warm and supportive
5. Avoid minimizing their situation or using platitudes

Keep the response under 200 words and focus on immediate safety.
`;

    try {
      const llmResponse = await this.llmGateway.generateResponse({
        prompt,
        systemPrompt:
          'You are a crisis support specialist trained in suicide prevention protocols.',
        modelTier: ModelTier.HIGH,
        temperature: 0.3,
      });

      return {
        escalationTrigger:
          user.riskProfile === RiskLevel.CRITICAL
            ? 'Critical risk level detected'
            : 'High risk behavior pattern',
        recommendedAction: llmResponse.content,
        isHandled: true,
        timestamp: new Date(),
      };
    } catch (error) {
      console.error('Error generating crisis response:', error);

      // Fallback response if LLM call fails
      return {
        escalationTrigger: 'Elevated risk detected',
        recommendedAction: 'Transition to crisis support resources immediately',
        isHandled: true,
        timestamp: new Date(),
      };
    }
  }

  // Helper methods
  private extractValue(text: string, key: string): string {
    const regex = new RegExp(`${key}:\\s*(.+)(?:\n|$)`);
    const match = text.match(regex);
    return match ? match[1].trim() : '';
  }

  private validateRiskLevel(level: string): RiskLevel {
    const upperLevel = level.toUpperCase();
    if (Object.values(RiskLevel).includes(upperLevel as RiskLevel)) {
      return upperLevel as RiskLevel;
    }

    // Default to MODERATE if invalid level returned
    return RiskLevel.MODERATE;
  }

  private createDefaultRiskSpectrum(): RiskSpectrum {
    return {
      level: RiskLevel.LOW,
      score: 0,
      indicators: [],
      lastAssessedAt: new Date(),
      requiresEscalation: false,
    };
  }
}
