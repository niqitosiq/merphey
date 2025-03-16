import { LLMAdapter } from '../../../infrastructure/llm/openai/LLMAdapter';
import { RiskAssessmentError } from '../../../shared/errors/domain-errors';

interface CrisisPattern {
  identifiedPatterns: string[];
  overallSeverity: number;
  requiresImmediateAction: boolean;
}

const HIGH_RISK_PATTERNS = [
  'suicidal_ideation',
  'self_harm',
  'violence',
  'severe_dissociation',
  'acute_crisis',
];

export class CrisisDetector {
  constructor(private llmService: LLMAdapter) {}

  /**
   * Scans a message for crisis patterns and risk indicators
   * @param message - The message to analyze
   * @returns CrisisPattern containing identified risks and severity
   * @throws RiskAssessmentError if analysis fails
   */
  async scanForRiskPatterns(message: string): Promise<CrisisPattern> {
    try {
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
      const result = this.parseAndValidateResponse(response);

      // Override immediateAction for high-risk patterns
      if (!result.requiresImmediateAction) {
        result.requiresImmediateAction = this.checkForHighRiskPatterns(result.identifiedPatterns);
      }

      return result;
    } catch (error) {
      throw new RiskAssessmentError(
        'Failed to analyze crisis patterns',
        error instanceof Error ? [error.message] : ['Unknown error'],
      );
    }
  }

  /**
   * Parses and validates the LLM response
   * @param response - Raw LLM response string
   * @returns Validated CrisisPattern
   * @throws Error if validation fails
   */
  private parseAndValidateResponse(response: string): CrisisPattern {
    let parsed: any;

    try {
      parsed = JSON.parse(response);
    } catch (error) {
      throw new Error('Invalid JSON response from LLM');
    }

    if (!Array.isArray(parsed.identifiedPatterns)) {
      throw new Error('Missing or invalid identifiedPatterns array');
    }

    if (
      typeof parsed.overallSeverity !== 'number' ||
      parsed.overallSeverity < 0 ||
      parsed.overallSeverity > 1
    ) {
      throw new Error('Invalid severity score');
    }

    if (typeof parsed.requiresImmediateAction !== 'boolean') {
      throw new Error('Invalid requiresImmediateAction flag');
    }

    return {
      identifiedPatterns: parsed.identifiedPatterns.map(String),
      overallSeverity: parsed.overallSeverity,
      requiresImmediateAction: parsed.requiresImmediateAction,
    };
  }

  /**
   * Checks if any high-risk patterns are present
   * @param patterns - Array of identified patterns
   * @returns boolean indicating if immediate action is needed
   */
  private checkForHighRiskPatterns(patterns: string[]): boolean {
    return patterns.some((pattern) =>
      HIGH_RISK_PATTERNS.some((highRisk) => pattern.toLowerCase().includes(highRisk)),
    );
  }
}
