import { LLMAdapter } from '../../../infrastructure/llm/openai/LLMAdapter';

interface CrisisPattern {
  identifiedPatterns: string[];
  overallSeverity: number;
  requiresImmediateAction: boolean;
}

export class CrisisDetector {
  constructor(private llmService: LLMAdapter) {}

  async scanForRiskPatterns(message: string): Promise<CrisisPattern> {
    const prompt = `Analyze this message for crisis patterns and risk indicators: "${message}"
    Return in JSON format:
    {
      "identifiedPatterns": [list of identified risk patterns],
      "overallSeverity": number between 0-1,
      "requiresImmediateAction": boolean
    }
    Focus on identifying:
    - Suicidal ideation or self-harm
    - Violence or harm to others
    - Severe emotional distress
    - Dissociative states
    - Panic attacks
    - Substance abuse crisis`;

    const response = await this.llmService.generateCompletion(prompt);
    return JSON.parse(response);
  }
}
