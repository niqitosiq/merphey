import { LlmPort } from '../../../domain/ports/llm.port';
import { RiskLevel } from '../../../domain/shared/enums';

interface CrisisResource {
  name: string;
  contact: string;
  description: string;
}

interface CrisisResourceRepository {
  findByRiskFactors(factors: string[]): Promise<CrisisResource[]>;
}

interface EmergencyResponse {
  content: string;
  resources: CrisisResource[];
  metadata: {
    riskLevel: RiskLevel;
    urgencyLevel: number;
    requiredActions: string[];
  };
}

/**
 * Specialized service for generating responses in emergency situations
 * Provides crisis-appropriate responses for high-risk scenarios
 */
export class EmergencyResponseGenerator {
  constructor(
    private openai: LlmPort,
    private crisisResourceRepository: CrisisResourceRepository,
  ) {}

  /**
   * Generates an emergency response for a critical risk situation
   * @param messageContent - User message content that triggered emergency
   * @param riskFactors - Risk factors identified in the message
   * @param riskLevel - The assessed risk level
   * @returns EmergencyResponse - Contains response and crisis resources
   */
  async generateEmergencyResponse(
    messageContent: string,
    riskFactors: string[],
    riskLevel: RiskLevel,
  ): Promise<EmergencyResponse> {
    try {
      // Get relevant crisis resources based on risk factors
      const relevantResources = await this.crisisResourceRepository.findByRiskFactors(riskFactors);

      // Generate crisis-appropriate response
      const prompt = this.buildEmergencyPrompt(messageContent, riskFactors, riskLevel);
      const completion = await this.openai.generateCompletion(prompt, {
        temperature: 0.3, // Lower temperature for more consistent crisis responses
        maxTokens: 1000,
        presencePenalty: 0.0, // Stick to proven crisis intervention language
        frequencyPenalty: 0.0,
      });

      // Analyze response for required actions
      const actionAnalysis = await this.openai.analyzeText(completion, 'crisis_actions');

      return {
        content: this.formatEmergencyResponse(completion, relevantResources),
        resources: relevantResources,
        metadata: {
          riskLevel,
          urgencyLevel: this.calculateUrgencyLevel(riskLevel, riskFactors),
          requiredActions: actionAnalysis.requiredActions || [],
        },
      };
    } catch (error) {
      // Always provide a safe fallback in emergency situations
      return this.getFallbackEmergencyResponse(riskLevel);
    }
  }

  /**
   * Builds an appropriate prompt for emergency response generation
   */
  private buildEmergencyPrompt(
    message: string,
    riskFactors: string[],
    riskLevel: RiskLevel,
  ): string {
    return `
As a crisis support specialist, provide an immediate, supportive response to someone in crisis.
Context: ${message}
Risk Factors: ${riskFactors.join(', ')}
Risk Level: ${riskLevel}

Required response elements:
1. Immediate acknowledgment of their situation
2. Clear expression of concern and support
3. Direct but gentle safety inquiries
4. Specific, actionable next steps
5. Crisis resource information integration

Response should be empathetic, clear, and focused on immediate safety.`;
  }

  /**
   * Formats the emergency response with integrated crisis resources
   */
  private formatEmergencyResponse(
    baseResponse: string,
    resources: Array<{ name: string; contact: string; description: string }>,
  ): string {
    const resourceSection = resources
      .map((r) => `${r.name} (${r.contact}): ${r.description}`)
      .join('\n');

    return `${baseResponse}\n\nImmediate Support Resources:\n${resourceSection}`;
  }

  /**
   * Calculates urgency level based on risk level and factors
   */
  private calculateUrgencyLevel(riskLevel: RiskLevel, riskFactors: string[]): number {
    const baseUrgency = {
      [RiskLevel.LOW]: 0.2,
      [RiskLevel.MEDIUM]: 0.5,
      [RiskLevel.HIGH]: 0.8,
      [RiskLevel.CRITICAL]: 1.0,
    }[riskLevel];

    const urgencyFactors = ['suicide', 'self_harm', 'violence', 'immediate_danger'];

    const factorCount = riskFactors.filter((f) => urgencyFactors.includes(f)).length;
    const factorMultiplier = 1 + factorCount * 0.1;

    return Math.min(1, baseUrgency * factorMultiplier);
  }

  /**
   * Provides a safe fallback response for emergency situations
   */
  private getFallbackEmergencyResponse(riskLevel: RiskLevel): EmergencyResponse {
    const defaultResources = [
      {
        name: 'Crisis Helpline',
        contact: '988',
        description: '24/7 crisis support and suicide prevention',
      },
    ];

    return {
      content:
        "I'm very concerned about your safety right now. " +
        'Please know that help is available 24/7 through the crisis helpline at 988. ' +
        'They are trained professionals who want to help. ' +
        'Would you be willing to call them or would you like to continue talking here first?',
      resources: defaultResources,
      metadata: {
        riskLevel,
        urgencyLevel: 1.0,
        requiredActions: ['provide_crisis_contacts', 'ensure_immediate_safety'],
      },
    };
  }
}
