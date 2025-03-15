/**
 * LLM Gateway Adapter - Unified interface for OpenRouter LLM API
 * Implements retry/circuit breaker patterns for resilient LLM integration
 */

export enum ModelTier {
  LOW = 'low', // e.g., GPT-3.5-Turbo
  HIGH = 'high', // e.g., GPT-4
}

export interface LLMRequest {
  prompt: string;
  systemPrompt?: string;
  modelTier: ModelTier;
  temperature?: number;
  maxTokens?: number;
  conversationHistory?: Array<{ role: string; content: string }>;
}

export interface LLMResponse {
  content: string;
  tokens: number;
  modelUsed: string;
  processingTime: number;
}

export interface LLMGatewayConfig {
  providers: {
    openrouter: {
      apiKey: string;
      lowTierModel: string;
      highTierModel: string;
    };
  };
  retryOptions: {
    maxRetries: number;
    initialDelayMs: number;
    backoffFactor: number;
  };
  circuitBreakerOptions: {
    failureThreshold: number;
    resetTimeoutMs: number;
  };
}

// Circuit breaker states
enum CircuitState {
  CLOSED, // Normal operation
  OPEN, // Failing, no requests allowed
  HALF_OPEN, // Testing if system is recovered
}

export class LLMGateway {
  private config: LLMGatewayConfig;
  private circuitState = CircuitState.CLOSED;
  private failureCount = 0;
  private nextResetTime = 0;
  private baseUrl = 'https://openrouter.ai/api/v1/chat/completions';

  constructor(config: LLMGatewayConfig) {
    this.config = config;
  }

  /**
   * Generate a response using the selected LLM via OpenRouter
   */
  async generateResponse(request: LLMRequest): Promise<LLMResponse> {
    this.checkCircuitBreaker();

    const startTime = Date.now();
    let retries = 0;
    let lastError: Error | null = null;

    // Select the appropriate model based on tier
    const modelName =
      request.modelTier === ModelTier.HIGH
        ? this.config.providers.openrouter.highTierModel
        : this.config.providers.openrouter.lowTierModel;

    while (retries <= this.config.retryOptions.maxRetries) {
      try {
        // Call OpenRouter API
        const result = await this.callOpenRouter(modelName, request);

        // Success - reset failure count
        this.failureCount = 0;

        const processingTime = Date.now() - startTime;
        return {
          content: result.content,
          tokens: result.tokens,
          modelUsed: result.modelUsed || modelName,
          processingTime,
        };
      } catch (error) {
        lastError = error as Error;
        const delay = this.calculateBackoffDelay(retries);
        await this.delay(delay);
        retries++;
      }
    }

    // Handle failure after all retries
    this.registerFailure();
    throw new Error(`LLM request failed after ${retries} retries: ${lastError?.message}`);
  }

  /**
   * Check if we should allow requests based on circuit breaker state
   */
  private checkCircuitBreaker(): void {
    const now = Date.now();

    switch (this.circuitState) {
      case CircuitState.OPEN:
        if (now >= this.nextResetTime) {
          this.circuitState = CircuitState.HALF_OPEN;
          console.log('Circuit breaker: HALF_OPEN - Testing recovery');
        } else {
          throw new Error('Circuit breaker open: Too many failures to LLM service');
        }
        break;

      case CircuitState.HALF_OPEN:
        // Allow the request to test if we've recovered
        break;

      case CircuitState.CLOSED:
        // Normal operation
        break;
    }
  }

  /**
   * Register a failure and potentially open the circuit breaker
   */
  private registerFailure(): void {
    this.failureCount++;

    if (this.failureCount >= this.config.circuitBreakerOptions.failureThreshold) {
      this.circuitState = CircuitState.OPEN;
      this.nextResetTime = Date.now() + this.config.circuitBreakerOptions.resetTimeoutMs;
      console.error(`Circuit breaker OPENED: Too many LLM failures (${this.failureCount})`);
    }
  }

  /**
   * Calculate retry delay with exponential backoff
   */
  private calculateBackoffDelay(retryCount: number): number {
    return (
      this.config.retryOptions.initialDelayMs *
      Math.pow(this.config.retryOptions.backoffFactor, retryCount)
    );
  }

  /**
   * Helper method to implement delay
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Call OpenRouter API for LLM completion
   */
  private async callOpenRouter(
    model: string,
    request: LLMRequest,
  ): Promise<{
    content: string;
    tokens: number;
    modelUsed?: string;
  }> {
    console.log(`[LLM Request] Model: ${model}, Prompt length: ${request.prompt.length} chars`);

    try {
      // Prepare the request payload for OpenRouter
      const messages = [];

      // Add system message if provided
      if (request.systemPrompt) {
        messages.push({
          role: 'system',
          content: request.systemPrompt,
        });
      }

      // Add conversation history if provided
      if (request.conversationHistory && request.conversationHistory.length > 0) {
        messages.push(...request.conversationHistory);
      }

      // Add the current user prompt
      messages.push({
        role: 'user',
        content: request.prompt,
      });

      // Create request options
      const requestOptions = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.providers.openrouter.apiKey}`,
          'HTTP-Referer': 'https://github.com/therapeutic-telegram-bot', // Your site URL
          'X-Title': 'Therapeutic Telegram Bot', // Optional, for OpenRouter analytics
        },
        body: JSON.stringify({
          model: model,
          messages: messages,
          temperature: request.temperature || 0.7,
          max_tokens: request.maxTokens || 500,
          stream: false,
        }),
      };

      // Make the API request
      const response = await fetch(this.baseUrl, requestOptions);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`OpenRouter API error (${response.status}): ${JSON.stringify(errorData)}`);
      }

      const data: any = await response.json();

      // Extract the response content and usage
      const content = data.choices[0]?.message?.content || '';
      const tokens = data.usage?.total_tokens || request.prompt.length / 4; // Fallback to estimate
      const modelUsed = data.model; // OpenRouter returns the actual model used

      return {
        content,
        tokens,
        modelUsed,
      };
    } catch (error) {
      console.error('Error calling OpenRouter LLM API:', error);
      throw error;
    }
  }
}
