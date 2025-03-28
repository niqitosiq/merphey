import { RiskLevel } from '@prisma/client';
import { LLMAdapter } from '../../../infrastructure/llm/openai/LLMAdapter';
import { buildEmergencyPrompt } from './prompts/emergencyResponse';
import { scoped, Lifecycle, injectable, autoInjectable } from 'tsyringe';

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

@scoped(Lifecycle.ContainerScoped)
@injectable()
@autoInjectable()
export class EmergencyService {
  constructor(
    private llmService: LLMAdapter,
    private crisisResourceRepository: CrisisResourceRepository,
  ) {}

  async generateResponse(
    messageContent: string,
    riskFactors: string[],
    riskLevel: RiskLevel,
    userLanguage: string = 'en',
  ): Promise<EmergencyResponse> {
    try {
      const relevantResources = await this.crisisResourceRepository.findByRiskFactors(riskFactors);

      const prompt = buildEmergencyPrompt({
        message: messageContent,
        riskFactors,
        riskLevel,
        userLanguage,
      });

      const response = await this.llmService.generateCompletion(prompt, {
        temperature: 0.3,
        maxTokens: 1000,
      });

      const parsedResponse = JSON.parse(response);

      return {
        content: parsedResponse.content,
        resources: relevantResources,
        metadata: {
          riskLevel,
          urgencyLevel: this.calculateUrgencyLevel(riskLevel, riskFactors),
          requiredActions: parsedResponse.requiredActions || [],
        },
      };
    } catch (error) {
      console.error('Error generating emergency response:', error);
      return this.getFallbackResponse(riskLevel, userLanguage);
    }
  }

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

  private getFallbackResponse(riskLevel: RiskLevel, language: string = 'en'): EmergencyResponse {
    const defaultResources = [
      {
        name: 'Crisis Helpline',
        contact: '988',
        description: '24/7 crisis support and suicide prevention',
      },
    ];

    const content =
      language === 'es'
        ? 'Me preocupa mucho tu seguridad en este momento. Por favor, llama a la línea de crisis 988.'
        : "I'm very concerned about your safety right now. Please call the crisis helpline at 988.";

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
