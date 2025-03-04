export class LLMError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly context?: any
  ) {
    super(message);
    this.name = 'LLMError';
  }
}

export class LLMErrorHandler {
  static handle(error: any): never {
    if (error instanceof LLMError) {
      throw error;
    }

    if (error.response?.status === 429) {
      throw new LLMError(
        'Rate limit exceeded. Please try again later.',
        'RATE_LIMIT_EXCEEDED',
        error
      );
    }

    if (error.response?.status === 401) {
      throw new LLMError(
        'Authentication failed. Please check your API key.',
        'AUTHENTICATION_FAILED',
        error
      );
    }

    if (error.response?.status === 400) {
      throw new LLMError(
        'Invalid request. Please check your input.',
        'INVALID_REQUEST',
        error
      );
    }

    throw new LLMError(
      'An unexpected error occurred while processing your request.',
      'UNKNOWN_ERROR',
      error
    );
  }

  static async withErrorHandling<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      LLMErrorHandler.handle(error);
    }
  }
}