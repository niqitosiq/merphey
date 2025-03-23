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
   * @param userLanguage - ISO language code for the user's language
   * @returns EmergencyResponse - Contains response and crisis resources
   */
  async generateEmergencyResponse(
    messageContent: string,
    riskFactors: string[],
    riskLevel: RiskLevel,
    userLanguage: string = 'en',
  ): Promise<EmergencyResponse> {
    try {
      // Get relevant crisis resources based on risk factors
      const relevantResources = await this.crisisResourceRepository.findByRiskFactors(riskFactors);

      // Generate crisis-appropriate response
      const prompt = this.buildEmergencyPrompt(
        messageContent,
        riskFactors,
        riskLevel,
        userLanguage,
      );

      const response = await this.openai.generateCompletion(prompt, {
        temperature: 0.3, // Lower temperature for more consistent crisis responses
        maxTokens: 1000,
        // presencePenalty: 0.0, // Stick to proven crisis intervention language
        // frequencyPenalty: 0.0,
      });

      // Parse the JSON response
      const parsedResponse = JSON.parse(response);

      // Analyze response for required actions (kept in English)
      const actionAnalysis = await this.openai.analyzeText(
        parsedResponse.content,
        'crisis_actions',
      );

      return {
        content: parsedResponse.content,
        resources: relevantResources,
        metadata: {
          riskLevel,
          urgencyLevel: this.calculateUrgencyLevel(riskLevel, riskFactors),
          requiredActions: actionAnalysis.requiredActions || [],
        },
      };
    } catch (error) {
      console.error('Error generating emergency response:', error);
      return this.getFallbackEmergencyResponse(riskLevel, userLanguage);
    }
  }

  /**
   * Builds an appropriate prompt for emergency response generation
   */
  private buildEmergencyPrompt(
    message: string,
    riskFactors: string[],
    riskLevel: RiskLevel,
    userLanguage: string,
  ): string {
    const languageInstruction =
      userLanguage !== 'en'
        ? `IMPORTANT: Generate the "content" field in ${userLanguage} language as it will be shown directly to the user. All other fields must be in English for internal processing.`
        : '';

    return `You are a crisis support specialist providing immediate assistance to someone in crisis.

${languageInstruction}

CONTEXT:
Message: ${message}
Risk Factors: ${riskFactors.join(', ')}
Risk Level: ${riskLevel}

RESPONSE REQUIREMENTS:
1. Immediate acknowledgment of their situation
2. Clear expression of concern and support
3. Direct but gentle safety inquiries
4. Specific, actionable next steps
5. Crisis resource information integration

Generate a JSON response with the following structure:
{
  "content": "Your crisis response here in ${userLanguage === 'en' ? 'English' : userLanguage} - THIS IS THE ONLY FIELD THAT SHOULD BE IN THE USER'S LANGUAGE",
  "requiredActions": ["action1_in_english", "action2_in_english"],
  "safetyPlan": {
    "immediateSteps": ["step1_in_english", "step2_in_english"],
    "copingStrategies": ["strategy1_in_english", "strategy2_in_english"]
  }
}

Response must be empathetic, clear, and focused on immediate safety.`;
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
   * @param riskLevel - The assessed risk level
   * @param language - User's language
   */
  private getFallbackEmergencyResponse(
    riskLevel: RiskLevel,
    language: string = 'en',
  ): EmergencyResponse {
    // Define default resources in English
    const defaultResources = [
      {
        name: 'Crisis Helpline',
        contact: '988',
        description: '24/7 crisis support and suicide prevention',
      },
    ];

    // Define content based on language
    let content: string;

    switch (language) {
      case 'es':
        content =
          'Me preocupa mucho tu seguridad en este momento. ' +
          'Por favor, debes saber que hay ayuda disponible las 24 horas a través de la línea de crisis 988. ' +
          'Son profesionales capacitados que quieren ayudar. ' +
          '¿Estarías dispuesto a llamarlos o preferirías seguir hablando aquí primero?';
        break;
      case 'fr':
        content =
          'Je suis très inquiet pour votre sécurité en ce moment. ' +
          "Sachez qu'une aide est disponible 24h/24 via la ligne de crise au 988. " +
          'Ce sont des professionnels formés qui souhaitent vous aider. ' +
          "Seriez-vous prêt à les appeler ou préféreriez-vous continuer à parler ici d'abord ?";
        break;
      default:
        content =
          "I'm very concerned about your safety right now. " +
          'Please know that help is available 24/7 through the crisis helpline at 988. ' +
          'They are trained professionals who want to help. ' +
          'Would you be willing to call them or would you like to continue talking here first?';
    }

    // Return emergency response with all metadata in English
    return {
      content,
      resources: defaultResources,
      metadata: {
        riskLevel,
        urgencyLevel: 1.0,
        requiredActions: ['provide_crisis_contacts', 'ensure_immediate_safety'],
      },
    };
  }
}
