import OpenAI from 'openai';
import { config } from '../config';
import { Logger } from '../../utils/logger';
import { MetricsService } from '../../utils/metrics';
import { ConversationContext, ConversationStepType } from '../../domain/entities/conversation';
import { LLMErrorHandler } from '../../utils/llm-error-handler';
import { log } from 'console';

export class AzureOpenAIService {
  public readonly client: OpenAI;
  private readonly logger = Logger.getInstance();
  private readonly metrics = MetricsService.getInstance();

  private readonly modelDeployments = {
    [ConversationStepType.INITIAL_ANALYSIS]: 'meta-llama/llama-3.3-70b-instruct:free',
    [ConversationStepType.CONVERSATION_PLAN]: 'deepseek/deepseek-r1-distill-llama-70b:free',
    [ConversationStepType.QUESTION_EXPLORATION]: 'meta-llama/llama-3.3-70b-instruct:free',
    [ConversationStepType.FINAL_ANALYSIS]: 'deepseek/deepseek-r1-distill-llama-70b:free',
    [ConversationStepType.HOMEWORK_GENERATION]: 'deepseek/deepseek-r1-distill-llama-70b:free',
    [ConversationStepType.STORY_GENERATION]: 'deepseek/deepseek-r1-distill-llama-70b:free',
  } as const;

  constructor() {
    this.client = new OpenAI({
      apiKey: config.azureOpenAI.apiKey,
      baseURL: config.azureOpenAI.endpoint,
    });
  }

  async processWithMetrics<T>(
    operation: () => Promise<T>,
    metricName: string,
    context: { step: string },
  ): Promise<T> {
    const timerId = this.metrics.startTimer(metricName, context);

    try {
      const result = await LLMErrorHandler.withErrorHandling(operation);
      this.metrics.recordMetric(`${metricName}_success`, 1, context);
      return result;
    } catch (error) {
      this.metrics.recordMetric(`${metricName}_failure`, 1, {
        ...context,
        error_type: (error as any).code || 'unknown',
      });
      throw error;
    } finally {
      this.metrics.endTimer(timerId);
    }
  }

  // Main method for processing any conversation step
  async process<T>(
    processor: (client: OpenAI, deployment: string, context: ConversationContext) => Promise<T>,
    context: ConversationContext,
    step: ConversationStepType,
  ): Promise<T> {
    const deployment = this.modelDeployments[step];
    if (!deployment) {
      throw new Error(`No deployment found for step: ${step}`);
    }

    const res = await this.processWithMetrics(
      () => processor(this.client, deployment, context),
      'llm_request',
      { step },
    );

    log('AzureOpenAIService.process', { step, res: JSON.stringify(res, null, '    ') });

    return res;
  }
}
