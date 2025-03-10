import { HistoryMessage } from '../models/conversation';
import { BaseResponse } from '../prompts';
import OpenAI from 'openai';
import { ChatCompletion, ChatCompletionMessageParam } from 'openai/resources';

export interface LlmConfig {
  apiKey: string;
  endpoint?: string;
  lowTierModel: string;
  highTierModel: string;
  maxRetries?: number;
  timeoutMs?: number;
}

export class LlmError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
    public readonly isRetryable: boolean = true,
  ) {
    super(message);
    this.name = 'LlmError';
  }
}

export class LlmService {
  private readonly openai: OpenAI;
  private readonly maxRetries: number;
  private readonly timeoutMs: number;

  constructor(private readonly config: LlmConfig) {
    this.openai = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.endpoint || 'https://openrouter.ai/api/v1',
    });
    this.maxRetries = config.maxRetries || 3;
    this.timeoutMs = config.timeoutMs || 300000;
  }

  async generateResponse<T extends BaseResponse>(
    messages: HistoryMessage[],
    systemPrompt: string,
    useHighTier: boolean = false,
    retryCount: number = 0,
  ): Promise<T> {
    const formattedMessages = this.formatMessages(messages, systemPrompt);

    try {
      const completion = (await Promise.race([
        this.openai.chat.completions.create(
          {
            model: useHighTier ? this.config.highTierModel : this.config.lowTierModel,
            messages: formattedMessages,
            temperature: useHighTier ? 0.7 : 0.9,
            max_tokens: useHighTier ? 2000 : 1000,
            response_format: { type: 'json_object' },
          },
          {
            headers: {
              'HTTP-Referer': 'https://github.com/niqitosiq/psychobot',
              'X-Title': 'Psychobot',
            },
          },
        ) as Promise<ChatCompletion>,
        new Promise((_, reject) =>
          setTimeout(() => reject(new LlmError('Request timeout')), this.timeoutMs),
        ),
      ])) as ChatCompletion;

      const content = completion?.choices[0]?.message?.content;
      if (!content) {
        throw new LlmError('Empty response from LLM');
      }

      try {
        // First try to parse as is
        const response = JSON.parse(content) as T;
        if (!this.validateResponse(response)) {
          throw new LlmError('Invalid response format', null, false);
        }
        return response;
      } catch (parseError) {
        // Try to clean up markdown formatting if present
        const cleanContent = content
          .replace(/```json\n?/, '')
          .replace(/```\n?/, '')
          .trim();

        const response = JSON.parse(cleanContent) as T;
        if (!this.validateResponse(response)) {
          throw new LlmError('Invalid response format', null, false);
        }
        return response;
      }
    } catch (error) {
      if (this.isRetryableError(error) && retryCount < this.maxRetries) {
        console.warn(`LLM request failed, retrying (${retryCount + 1}/${this.maxRetries})...`);
        await new Promise((resolve) => setTimeout(resolve, Math.pow(2, retryCount) * 1000));
        return this.generateResponse(messages, systemPrompt, useHighTier, retryCount + 1);
      }

      if (error instanceof LlmError) {
        throw error;
      }

      throw new LlmError('Failed to generate LLM response', error, this.isRetryableError(error));
    }
  }

  private formatMessages(
    messages: HistoryMessage[],
    systemPrompt: string,
  ): ChatCompletionMessageParam[] {
    const formattedMessages = messages.map((msg) => ({
      role: msg.role,
      content: msg.text,
    })) as ChatCompletionMessageParam[];

    return [{ role: 'system', content: systemPrompt }, ...formattedMessages];
  }

  private validateResponse(response: any): response is BaseResponse {
    return (
      response &&
      typeof response === 'object' &&
      typeof response.text === 'string' &&
      typeof response.reason === 'string'
    );
  }

  private isRetryableError(error: unknown): boolean {
    if (error instanceof LlmError) {
      return error.isRetryable;
    }

    const retryableErrors = [
      'rate_limit_exceeded',
      'timeout',
      'service_unavailable',
      'internal_server_error',
      'bad_gateway',
      'gateway_timeout',
    ];

    return (
      error instanceof Error &&
      (error.name === 'APIError' ||
        retryableErrors.some((e) => error.message.toLowerCase().includes(e)))
    );
  }
}
