import { TherapeuticPlan } from '../../aggregates/therapy/entities/TherapeuticPlan';
import { LLMAdapter } from '../../../infrastructure/llm/openai/LLMAdapter';
import { Message } from 'src/domain/aggregates/conversation/entities/Message';
import { UserMessage } from 'src/domain/aggregates/conversation/entities/types';
import { Goal } from 'src/domain/aggregates/therapy/entities/PlanVersion';
import { buildCognitiveAnalysisPrompt } from './prompts/cognitiveAnalysis';

export interface AnalysisResult {
  shouldBeRevised: boolean;
  nextGoal?: Goal['codename'];
  language: string;
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
    message: Message,
    plan: TherapeuticPlan | null,
    history: UserMessage[],
  ): Promise<AnalysisResult> {
    const prompt = buildCognitiveAnalysisPrompt({
      message,
      plan,
      history,
    });

    console.log(prompt);
    const response = await this.llmService.generateCompletion(prompt, {
      model: 'google/gemini-2.0-flash-001',
    });

    try {
      return this.parseAnalysisResponse(response);
    } catch (error: any) {
      throw new Error(`Failed to parse analysis response: ${error.message}`);
    }
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
    // Basic validation of required fields
    if (typeof analysis.shouldBeRevised !== 'boolean') {
      throw new Error('Analysis must include shouldBeRevised boolean field');
    }
    if (typeof analysis.language !== 'string') {
      throw new Error('Analysis must include language string field');
    }
  }
}
