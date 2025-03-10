import { StateManager } from './state-manager.service';
import {
  ConversationContext,
  HistoryMessage,
  ConversationState,
  RiskLevel,
} from '../models/conversation';
import {
  COMMUNICATOR_PROMPT,
  PSYCHOLOGIST_PROMPT,
  FINISHING_PROMPT,
  CommunicatorResponse,
  PsychologistResponse,
  FinishingResponse,
} from '../prompts';
import { LlmService } from './llm.service';
import { BackgroundTaskManager } from './background-task.service';

export interface MessageProcessorConfig {
  lowTierModel: string;
  highTierModel: string;
  enableBackgroundProcessing?: boolean;
  maxBackgroundTasks?: number;
  backgroundTaskTimeoutMs?: number;
}

export interface ProcessedResponse {
  messages: string[];
  shouldEndSession?: boolean;
  transition?: {
    state: ConversationState;
    reason: string;
  };
  riskLevel: RiskLevel;
  metrics?: {
    engagementLevel?: 'LOW' | 'MEDIUM' | 'HIGH';
    emotionalTone?: string;
    progressIndicators?: {
      sessionProgress: number;
      therapeuticAlignment: number;
      riskTrend: 'IMPROVING' | 'STABLE' | 'WORSENING';
    };
  };
}

export class MessageProcessor {
  private readonly backgroundTaskManager: BackgroundTaskManager;

  constructor(
    private readonly stateManager: StateManager,
    private readonly llmService: LlmService,
    private readonly config: MessageProcessorConfig,
  ) {
    this.backgroundTaskManager = new BackgroundTaskManager(
      config.backgroundTaskTimeoutMs || 5 * 60 * 1000,
    );
  }

  async processMessage(
    context: ConversationContext,
    message: HistoryMessage,
  ): Promise<ProcessedResponse> {
    try {
      // First get communicator's assessment with enhanced response
      const communicatorResponse = await this.generateCommunicatorResponse(context);

      // Check for completed background tasks and integrate their results
      await this.integrateBackgroundTasks(context);

      // Assess risk level with more context
      const assessedRisk = this.stateManager.assessRiskLevel(
        context.riskLevel || 'LOW',
        context.history,
        communicatorResponse.urgency,
      );

      // Attempt state transition with enhanced context
      const stateTransition = this.stateManager.attemptStateTransition(
        context,
        communicatorResponse.suggestedNextState,
        communicatorResponse.stateReason,
        assessedRisk,
      );

      // Update message metadata with enhanced information
      if (stateTransition) {
        message.metadata = {
          ...message.metadata,
          stateTransition: {
            from: stateTransition.from,
            to: stateTransition.to,
            reason: stateTransition.reason,
          },
          emotionalTone: communicatorResponse.emotionalTone,
          riskFactors: communicatorResponse.riskFactors,
        };
      }

      // Handle high risk situations with more context
      if (assessedRisk === 'HIGH' || assessedRisk === 'CRITICAL') {
        return this.handleHighRiskSituation(context, communicatorResponse);
      }

      // Schedule background analysis if needed
      if (this.shouldTriggerBackgroundAnalysis(context, communicatorResponse)) {
        await this.scheduleBackgroundAnalysis(context);
      }

      // Handle session completion with enhanced metrics
      if (context.state === ConversationState.SESSION_CLOSING) {
        return this.handleSessionClosing(context);
      }

      // Enhanced normal response
      return {
        messages: [communicatorResponse.text],
        riskLevel: assessedRisk,
        transition: stateTransition
          ? {
              state: stateTransition.to,
              reason: stateTransition.reason,
            }
          : undefined,
        metrics: {
          engagementLevel: communicatorResponse.engagementLevel,
          emotionalTone: communicatorResponse.emotionalTone,
        },
      };
    } catch (error) {
      console.error('Error processing message:', error);
      context.state = ConversationState.ERROR_RECOVERY;
      return {
        messages: ['I encountered an issue. Let me take a moment to ensure everything is okay.'],
        riskLevel: 'LOW',
      };
    }
  }

  private async handleHighRiskSituation(
    context: ConversationContext,
    communicatorResponse: CommunicatorResponse,
  ): Promise<ProcessedResponse> {
    context.isThinking = true;
    const analysis = await this.generatePsychologistResponse(context);
    context.isThinking = false;
    context.lastAnalysisTimestamp = Date.now();

    const messages = [analysis.text];
    if (analysis.safetyRecommendations?.length) {
      messages.push('Safety Recommendations:\n' + analysis.safetyRecommendations.join('\n'));
    }

    if (analysis.therapeuticPlan) {
      messages.push('Suggested approach:\n' + analysis.therapeuticPlan);
    }

    return {
      messages,
      riskLevel: analysis.riskLevel,
      transition: {
        state: analysis.nextState,
        reason: analysis.stateReason,
      },
    };
  }

  private async integrateBackgroundTasks(context: ConversationContext): Promise<void> {
    const tasks = this.backgroundTaskManager.getTasksForContext(context.userId);
    const completedTasks = tasks.filter((task) => task.status === 'completed');

    for (const task of completedTasks) {
      if (task.type === 'analysis') {
        const analysis = task.result as PsychologistResponse;
        context.history.push({
          text: analysis.text,
          from: 'psychologist',
          role: 'assistant',
          timestamp: Date.now(),
          metadata: {
            riskLevel: analysis.riskLevel,
            stateTransition: {
              from: context.state, // Include current state as 'from'
              to: analysis.nextState,
              reason: analysis.stateReason,
            },
          },
        });
      }
    }
  }

  private async scheduleBackgroundAnalysis(context: ConversationContext): Promise<void> {
    await this.backgroundTaskManager.scheduleTask('analysis', context.userId, () =>
      this.generatePsychologistResponse(context),
    );
  }

  private shouldTriggerBackgroundAnalysis(
    context: ConversationContext,
    response: CommunicatorResponse,
  ): boolean {
    if (!this.config.enableBackgroundProcessing) return false;

    const activeTasks = this.backgroundTaskManager
      .getTasksForContext(context.userId)
      .filter((task) => task.status === 'running' || task.status === 'pending');

    if (activeTasks.length >= (this.config.maxBackgroundTasks || 2)) return false;

    const timeSinceLastAnalysis = context.lastAnalysisTimestamp
      ? Date.now() - context.lastAnalysisTimestamp
      : Number.MAX_VALUE;

    return (
      timeSinceLastAnalysis > 5 * 60 * 1000 && // 5 minutes
      (response.suggestedNextState === ConversationState.ANALYSIS_NEEDED ||
        response.engagementLevel === 'LOW' ||
        response.riskFactors.length > 0)
    );
  }

  private async handleSessionClosing(context: ConversationContext): Promise<ProcessedResponse> {
    const finishingResponse = await this.generateFinishingResponse(context);

    const messages = [
      finishingResponse.text,
      `Recommendations: ${finishingResponse.recommendations}`,
      `Next steps: ${finishingResponse.nextSteps}`,
    ];

    return {
      messages,
      shouldEndSession: true,
      riskLevel: context.riskLevel,
      transition: {
        state: ConversationState.SESSION_CLOSING,
        reason: finishingResponse.reason,
      },
      metrics: finishingResponse.summaryMetrics
        ? {
            progressIndicators: {
              sessionProgress: finishingResponse.summaryMetrics.progressMade,
              therapeuticAlignment: finishingResponse.summaryMetrics.engagementQuality,
              riskTrend: finishingResponse.summaryMetrics.riskTrend,
            },
          }
        : undefined,
    };
  }

  private async generateCommunicatorResponse(
    context: ConversationContext,
  ): Promise<CommunicatorResponse> {
    return this.llmService.generateResponse<CommunicatorResponse>(
      context.history,
      COMMUNICATOR_PROMPT,
      false,
    );
  }

  private async generatePsychologistResponse(
    context: ConversationContext,
  ): Promise<PsychologistResponse> {
    return this.llmService.generateResponse<PsychologistResponse>(
      context.history,
      PSYCHOLOGIST_PROMPT,
      true,
    );
  }

  private async generateFinishingResponse(
    context: ConversationContext,
  ): Promise<FinishingResponse> {
    return this.llmService.generateResponse<FinishingResponse>(
      context.history,
      FINISHING_PROMPT,
      true,
    );
  }
}
