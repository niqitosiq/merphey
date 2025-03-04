import { AzureOpenAI } from 'openai';
import { config } from '../config';
import { log } from 'console';
import { ConversationProcessors } from './conversation-processors';
import { LLMErrorHandler } from '../../utils/llm-error-handler';
import { Logger } from '../../utils/logger';
import { MetricsService } from '../../utils/metrics';
import {
  ConversationStepType,
  ConversationContext,
  ConversationPlan,
  QuestionNode,
  QuestionExplorationResult,
  BatchExplorationResult,
  QuestionExplorationProgress,
} from '../../domain/entities/conversation';

export class AzureOpenAIService {
  private client: AzureOpenAI;
  private readonly logger = Logger.getInstance();
  private readonly metrics = MetricsService.getInstance();

  private readonly modelDeployments = {
    [ConversationStepType.INITIAL_ANALYSIS]: 'gpt-4o-mini',
    [ConversationStepType.CONVERSATION_PLAN]: 'gpt-4o-mini',
    [ConversationStepType.QUESTION_GENERATION]: 'gpt-4o-mini',
    [ConversationStepType.QUESTION_EXPLORATION]: 'gpt-4o-mini',
    [ConversationStepType.FINAL_ANALYSIS]: 'gpt-4o-mini',
  } as const;

  private readonly stepProcessors = {
    [ConversationStepType.INITIAL_ANALYSIS]: ConversationProcessors.initialAnalysis,
    [ConversationStepType.QUESTION_GENERATION]: ConversationProcessors.questionGeneration,
    [ConversationStepType.CONVERSATION_PLAN]: ConversationProcessors.conversationPlan,
    [ConversationStepType.QUESTION_EXPLORATION]: ConversationProcessors.questionExploration,
    [ConversationStepType.FINAL_ANALYSIS]: ConversationProcessors.finalAnalysis,
  };

  constructor() {
    this.client = new AzureOpenAI({
      apiKey: config.azureOpenAI.apiKey,
      endpoint: config.azureOpenAI.endpoint,
      apiVersion: config.azureOpenAI.apiVersion,
    });
  }

  private async processConversationStep(
    stepType: ConversationStepType,
    context: ConversationContext,
  ): Promise<any> {
    return LLMErrorHandler.withErrorHandling(async () => {
      const deployment = this.modelDeployments[stepType];
      this.logger.debug(`Processing ${stepType}`, { deployment });

      const timerId = this.metrics.startTimer('llm_request_duration', {
        step_type: stepType,
        deployment,
      });

      try {
        const processor = this.stepProcessors[stepType];
        if (!processor) {
          throw new Error(`Unknown conversation step type: ${stepType}`);
        }

        const result = await processor.process(this.client, deployment, context);

        // Record success metrics
        this.metrics.recordMetric('llm_request_success', 1, {
          step_type: stepType,
          deployment,
        });

        return result;
      } catch (error: any) {
        // Record failure metrics
        this.metrics.recordMetric('llm_request_failure', 1, {
          step_type: stepType,
          deployment,
          error_type: error.code || 'unknown',
        });
        throw error;
      } finally {
        this.metrics.endTimer(timerId);
      }
    });
  }

  async processInitialMessage(message: string): Promise<string> {
    const timerId = this.metrics.startTimer('initial_message_processing');
    try {
      const result = await this.processConversationStep(ConversationStepType.INITIAL_ANALYSIS, {
        initialProblem: message,
      });
      return result;
    } finally {
      this.metrics.endTimer(timerId);
    }
  }

  async generateQuestions(analyzedProblem: string) {
    const timerId = this.metrics.startTimer('question_generation');
    try {
      return await this.processConversationStep(ConversationStepType.QUESTION_GENERATION, {
        analyzedProblem,
      });
    } finally {
      this.metrics.endTimer(timerId);
    }
  }

  async generateConversationPlan(analyzedProblem: string): Promise<ConversationPlan> {
    const timerId = this.metrics.startTimer('conversation_plan_generation');
    try {
      return await this.processConversationStep(ConversationStepType.CONVERSATION_PLAN, {
        analyzedProblem,
      });
    } finally {
      this.metrics.endTimer(timerId);
    }
  }

  async exploreQuestion(
    currentQuestion: QuestionNode,
    initialProblem: string,
    previousAnswers: Record<string, string> = {},
    conversationHistory: Array<{ role: string; content: string }> = [],
    currentQuestionExchanges: number = 0,
  ): Promise<QuestionExplorationResult> {
    const timerId = this.metrics.startTimer('question_exploration', {
      question_id: currentQuestion.id,
      exchanges: currentQuestionExchanges.toString(),
    });

    try {
      return await this.processConversationStep(ConversationStepType.QUESTION_EXPLORATION, {
        currentQuestion,
        initialProblem,
        previousAnswers,
        conversationHistory,
        currentQuestionExchanges,
      });
    } finally {
      this.metrics.endTimer(timerId);
    }
  }

  async exploreQuestions(
    initialProblem: string,
    conversationPlan: ConversationPlan,
    previousAnswers: Record<string, string> = {},
    conversationHistory: Array<{ role: string; content: string }> = [],
    questionProgress: Record<string, QuestionExplorationProgress> = {},
  ): Promise<BatchExplorationResult> {
    const timerId = this.metrics.startTimer('batch_question_exploration');
    try {
      return await this.processConversationStep(ConversationStepType.QUESTION_EXPLORATION, {
        initialProblem,
        conversationPlan,
        previousAnswers,
        conversationHistory,
        questionProgress,
      });
    } finally {
      this.metrics.endTimer(timerId);
    }
  }

  async generateFinalAnalysis(
    initialProblem: string,
    questionsAndAnswers: Array<{ question: string; answer: string }>,
  ): Promise<string> {
    const timerId = this.metrics.startTimer('final_analysis_generation');
    try {
      return await this.processConversationStep(ConversationStepType.FINAL_ANALYSIS, {
        initialProblem,
        questionsAndAnswers,
      });
    } finally {
      this.metrics.endTimer(timerId);
    }
  }
}
