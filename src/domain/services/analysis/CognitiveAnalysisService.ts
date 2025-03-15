import { UserMessage } from '../../aggregates/conversation/entities/types';
import { TherapeuticPlan } from '../../aggregates/therapy/entities/TherapeuticPlan';
import { LLMAdapter } from '../../../infrastructure/llm/openai/LLMAdapter';

interface AnalysisResult {
  emotionalThemes: {
    primary: string;
    secondary: string[];
    intensity: number;
  };
  cognitivePatternsIdentified: {
    pattern: string;
    evidence: string;
    severity: number;
  }[];
  therapeuticProgress: {
    alignmentWithGoals: number;
    identifiedSetbacks: string[];
    improvements: string[];
  };
  engagementMetrics: {
    coherence: number;
    openness: number;
    resistanceLevel: number;
  };
  therapeuticOpportunities: string[];
}

/**
 * Domain service for analyzing user messages in therapeutic context
 * Provides deep cognitive and emotional analysis of user communications
 */
export class ContextAnalyzer {
  constructor(private llmService: LLMAdapter) {}

  /**
   * Performs deep analysis of user message within conversation context
   * @param message - Current user message
   * @param plan - Current therapeutic plan
   * @param history - Previous conversation history
   * @returns Analysis - Cognitive and emotional insights from the message
   */
  async analyzeMessage(
    message: UserMessage,
    plan: TherapeuticPlan,
    history: UserMessage[],
  ): Promise<AnalysisResult> {
    const prompt = this.constructAnalysisPrompt(message, plan, history);
    const response = await this.llmService.generateCompletion(prompt);

    try {
      return this.parseAnalysisResponse(response);
    } catch (error: any) {
      throw new Error(`Failed to parse analysis response: ${error.message}`);
    }
  }

  private constructAnalysisPrompt(
    message: UserMessage,
    plan: TherapeuticPlan,
    history: UserMessage[],
  ): string {
    const recentHistory = history
      .slice(-5)
      .map((m) => m.content)
      .join('\n');
    const planContent = plan.currentVersion?.getContent();
    const goals = planContent ? planContent.goals.join(', ') : 'No current goals';

    return `Analyze this therapeutic conversation message with context:

Current message: "${message.content}"

Recent conversation history:
${recentHistory}

Therapeutic goals: ${goals}

Provide a detailed analysis in JSON format covering:
{
  "emotionalThemes": {
    "primary": "main emotion",
    "secondary": ["other emotions"],
    "intensity": 0-1
  },
  "cognitivePatternsIdentified": [{
    "pattern": "identified pattern",
    "evidence": "supporting text",
    "severity": 0-1
  }],
  "therapeuticProgress": {
    "alignmentWithGoals": 0-1,
    "identifiedSetbacks": ["setback descriptions"],
    "improvements": ["improvement descriptions"]
  },
  "engagementMetrics": {
    "coherence": 0-1,
    "openness": 0-1,
    "resistanceLevel": 0-1
  },
  "therapeuticOpportunities": ["opportunity descriptions"]
}`;
  }

  private parseAnalysisResponse(response: string): AnalysisResult {
    try {
      const parsed = JSON.parse(response);
      this.validateAnalysisStructure(parsed);
      return parsed;
    } catch (error: any) {
      throw new Error(`Invalid analysis format: ${error.message}`);
    }
  }

  private validateAnalysisStructure(analysis: any): void {
    const requiredFields = [
      'emotionalThemes',
      'cognitivePatternsIdentified',
      'therapeuticProgress',
      'engagementMetrics',
      'therapeuticOpportunities',
    ];

    for (const field of requiredFields) {
      if (!analysis[field]) {
        throw new Error(`Missing required field: ${field}`);
      }
    }

    if (
      typeof analysis.emotionalThemes.intensity !== 'number' ||
      analysis.emotionalThemes.intensity < 0 ||
      analysis.emotionalThemes.intensity > 1
    ) {
      throw new Error('Invalid emotional intensity value');
    }

    if (!Array.isArray(analysis.cognitivePatternsIdentified)) {
      throw new Error('Cognitive patterns must be an array');
    }
  }
}
