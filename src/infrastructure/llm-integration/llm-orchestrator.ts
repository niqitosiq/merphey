import { LLMGateway, ModelTier } from './llm-gateway.adapter';

interface RetryConfig {
  maxAttempts: number;
  baseDelay: number;
  maxDelay: number;
}

interface CircuitBreakerConfig {
  failureThreshold: number;
  resetTimeout: number;
}

export class LLMOrchestrator {
  private failures: number = 0;
  private lastFailureTime: number = 0;
  private isCircuitOpen: boolean = false;

  constructor(
    private llmGateway: LLMGateway,
    private retryConfig: RetryConfig = {
      maxAttempts: 3,
      baseDelay: 1000,
      maxDelay: 5000
    },
    private circuitConfig: CircuitBreakerConfig = {
      failureThreshold: 5,
      resetTimeout: 60000
    }
  ) {}

  private async withRetry<T>(operation: () => Promise<T>): Promise<T> {
    let lastError: Error;
    
    for (let attempt = 1; attempt <= this.retryConfig.maxAttempts; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;
        if (attempt < this.retryConfig.maxAttempts) {
          const delay = Math.min(
            this.retryConfig.baseDelay * Math.pow(2, attempt - 1),
            this.retryConfig.maxDelay
          );
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    throw lastError!;
  }

  private checkCircuitBreaker(): void {
    if (this.isCircuitOpen) {
      const now = Date.now();
      if (now - this.lastFailureTime >= this.circuitConfig.resetTimeout) {
        this.isCircuitOpen = false;
        this.failures = 0;
      } else {
        throw new Error('Circuit breaker is open');
      }
    }
  }

  private handleFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();
    
    if (this.failures >= this.circuitConfig.failureThreshold) {
      this.isCircuitOpen = true;
    }
  }

  private handleSuccess(): void {
    this.failures = 0;
  }

  async executeWithResilience<T>(
    operation: () => Promise<T>,
    modelTier: ModelTier
  ): Promise<T> {
    this.checkCircuitBreaker();
    
    try {
      const result = await this.withRetry(operation);
      this.handleSuccess();
      return result;
    } catch (error) {
      this.handleFailure();
      throw error;
    }
  }

  async analyzeContext(prompt: string, systemPrompt?: string): Promise<string> {
    return this.executeWithResilience(
      () => this.llmGateway.generateResponse({
        prompt,
        systemPrompt,
        modelTier: ModelTier.LOW,
        temperature: 0.3
      }).then(response => response.content),
      ModelTier.LOW
    );
  }

  async assessRisk(prompt: string, systemPrompt?: string): Promise<string> {
    return this.executeWithResilience(
      () => this.llmGateway.generateResponse({
        prompt,
        systemPrompt,
        modelTier: ModelTier.HIGH, // Using high-tier model for risk assessment
        temperature: 0.2
      }).then(response => response.content),
      ModelTier.HIGH
    );
  }

  async generateTherapeuticResponse(prompt: string, systemPrompt?: string): Promise<string> {
    return this.executeWithResilience(
      () => this.llmGateway.generateResponse({
        prompt,
        systemPrompt,
        modelTier: ModelTier.MEDIUM,
        temperature: 0.7
      }).then(response => response.content),
      ModelTier.MEDIUM
    );
  }
}