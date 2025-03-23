import { LlmServiceError } from '../../../shared/errors/application-errors';
import { LlmPort } from '../../../domain/ports/llm.port';
// LlmServiceError

/**
 * OpenRouter API adapter implementation
 * Provides interface to various language models through OpenRouter
 */
export class LLMAdapter implements LlmPort {
  private readonly baseUrl = 'https://openrouter.ai/api/v1';

  /**
   * Initializes the OpenRouter client
   * @param apiKey - OpenRouter API key
   * @param defaultModel - Default model to use (defaults to gpt-4)
   */
  constructor(
    private readonly apiKey: string,
    private readonly defaultModel: string = 'gpt-4',
  ) {
    if (!apiKey) {
      throw new LlmServiceError('API_KEY_REQUIRED', 'OpenRouter API key is required');
    }
  }

  /**
   * Makes a request to OpenRouter API
   * @param endpoint - API endpoint
   * @param body - Request body
   * @returns Response data
   */
  private async makeRequest(endpoint: string, body: any): Promise<any> {
    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://psychobot.app', // Replace with your actual domain
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new LlmServiceError(
          'API_ERROR',
          `OpenRouter API error: ${(errorData as any).message || response.statusText}`,
        );
      }

      return await response.json();
    } catch (error: unknown) {
      if (error instanceof LlmServiceError) {
        throw error;
      }
      throw new LlmServiceError(
        'REQUEST_FAILED',
        `Failed to make OpenRouter API request: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Detects the language of the provided text
   * @param text - Text to analyze for language
   * @returns Promise<string> - ISO language code (e.g., 'en', 'es', 'fr')
   */
  async detectLanguage(text: string): Promise<string> {
    try {
      const prompt = `Analyze the following text and determine the language. Return only the ISO 639-1 language code (e.g., 'en' for English, 'es' for Spanish, 'fr' for French) without quotes or any other text: "${text}"`;

      const response = await this.makeRequest('/chat/completions', {
        model: this.defaultModel,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.1, // Lower temperature for more consistent analytical results
        max_tokens: 10, // We only need a short response
      });

      if (!response.choices?.[0]?.message?.content) {
        throw new LlmServiceError('NO_LANGUAGE_DETECTION', 'No language detected');
      }

      // Extract just the language code from the response
      const languageCode = response.choices[0].message.content
        .trim()
        .toLowerCase()
        .match(/^[a-z]{2}$/);
      return languageCode ? languageCode[0] : 'en'; // Default to English if no valid code is detected
    } catch (error: unknown) {
      console.error('Language detection error:', error);
      return 'en'; // Default to English on error
    }
  }

  /**
   * Generates text completion from a prompt
   * @param prompt - The prompt to complete
   * @param options - Additional model options
   * @returns string - Generated text completion
   */
  async generateCompletion(prompt: string, options?: any): Promise<string> {
    const maxRetries = options?.maxRetries || 2;
    let retries = 0;

    while (true) {
      try {
        // Add language instruction if specified in options
        const languageInstruction =
          options?.language && options.language !== 'en'
            ? `Respond in ${options.language} language. `
            : '';

        const modifiedPrompt = languageInstruction + prompt;

        const response = await this.makeRequest('/chat/completions', {
          model: options?.model || this.defaultModel,
          messages: [
            {
              role: 'user',
              content: modifiedPrompt,
            },
          ],
          temperature: options?.temperature || 0.5,
          max_tokens: options?.maxTokens || 2000,
          response_format: { type: 'json_object' },
        });

        // if (!response.choices?.[0]?.message?.content) {
        //   throw new LlmServiceError('NO_COMPLETION', 'No completion generated');
        // }

        const content = response.choices[0].message.content
          .replace(/```json\n/, '')
          .replace(/```/, '')
          .trim()
          //remove all before first {
          // and all after last }
          .replace(/.*?({)/, '{')
          .replace(/(})[^}]*$/, '}');

        console.log(content, 'content');

        // Validate if content is valid JSON
        try {
          JSON.parse(content);
          return content;
        } catch (parseError) {
          console.warn(
            `Failed to parse JSON response: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`,
          );

          // If we've reached max retries, return the content anyway
          if (retries >= maxRetries) {
            console.warn(`Max retries (${maxRetries}) reached, returning unparsable content`);
            return content;
          }

          // Otherwise, increment retries and try again
          retries++;
          console.info(`Retrying request (${retries}/${maxRetries})...`);
          continue;
        }
      } catch (error: unknown) {
        if (error instanceof LlmServiceError) {
          throw error;
        }
        throw new LlmServiceError(
          'COMPLETION_FAILED',
          `Failed to generate completion: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
      }
    }
  }

  /**
   * Analyzes text for specific attributes
   * @param text - Text to analyze
   * @param analysisType - Type of analysis to perform
   * @returns object - Analysis results
   */
  async analyzeText(text: string, analysisType: string): Promise<any> {
    try {
      const analysisPrompt = this.getAnalysisPrompt(text, analysisType);
      const response = await this.generateCompletion(analysisPrompt, {
        temperature: 0.3, // Lower temperature for more consistent analytical results
      });

      return JSON.parse(response);
    } catch (error: unknown) {
      throw new LlmServiceError(
        'ANALYSIS_FAILED',
        `Failed to analyze text: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Embeds text into vector space
   * @param text - Text to embed
   * @returns number[] - Vector representation
   */
  async embedText(text: string): Promise<number[]> {
    try {
      const response = await this.makeRequest('/embeddings', {
        model: 'text-embedding-ada-002', // OpenRouter supports OpenAI's embedding model
        input: text,
      });

      if (!response.data?.[0]?.embedding) {
        throw new LlmServiceError('NO_EMBEDDING', 'No embedding generated');
      }

      return response.data[0].embedding;
    } catch (error: unknown) {
      if (error instanceof LlmServiceError) {
        throw error;
      }
      throw new LlmServiceError(
        'EMBEDDING_FAILED',
        `Failed to generate embedding: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Generates appropriate prompt for different types of analysis
   * @param text - Text to analyze
   * @param analysisType - Type of analysis to perform
   * @returns string - Analysis prompt
   */
  private getAnalysisPrompt(text: string, analysisType: string): string {
    const prompts: Record<string, string> = {
      sentiment: `Analyze the sentiment of the following text and return a JSON object with 'score' (-1 to 1) and 'label' (negative, neutral, positive): "${text}"`,
      emotion: `Analyze the emotions in the following text and return a JSON object with detected emotions and their confidence scores (0-1): "${text}"`,
      risk: `Assess the risk level in the following text and return a JSON object with 'riskLevel' (none, low, medium, high, critical) and 'concerns' (array of identified issues): "${text}"`,
      topics: `Identify the main topics in the following text and return a JSON array of topic strings: "${text}"`,
      language: `Detect the language of the following text and return a JSON object with 'languageCode' (ISO 639-1 format) and 'confidence' (0-1): "${text}"`,
    };

    return (
      prompts[analysisType] ||
      `Analyze the following text for ${analysisType} and return the results as JSON: "${text}"`
    );
  }
}
