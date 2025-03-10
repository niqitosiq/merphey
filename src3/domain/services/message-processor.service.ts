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
      // First get communicator's assessment
      const communicatorResponse = await this.generateCommunicatorResponse(context);

      // Check for completed background tasks
      await this.integrateBackgroundTasks(context);

      // Assess risk level
      const assessedRisk = this.stateManager.assessRiskLevel(
        context.riskLevel || 'LOW',
        context.history,
        communicatorResponse.urgency,
      );

      // Handle high risk situations internally
      if (assessedRisk === 'HIGH' || assessedRisk === 'CRITICAL') {
        const analysis = await this.generatePsychologistResponse(context);

        // Store analysis but don't show to user
        context.history.push({
          text: analysis.prompt,
          from: 'psychologist',
          role: 'system',
          timestamp: Date.now(),
          metadata: {
            riskLevel: analysis.riskLevel,
            reason: analysis.text,
            stateTransition: {
              from: context.state,
              to: analysis.nextState,
              reason: analysis.stateReason,
            },
          },
        });

        // Get new communicator response with analysis context
        const updatedResponse = await this.generateCommunicatorResponse(context);

        return {
          messages: [updatedResponse.text],
          riskLevel: analysis.riskLevel,
          transition: {
            state: analysis.nextState,
            reason: analysis.stateReason,
          },
        };
      }

      // Handle session closing
      if (context.state === ConversationState.SESSION_CLOSING) {
        const finishingResponse = await this.generateFinishingResponse(context);

        // Store analysis but don't show to user
        context.history.push({
          text: finishingResponse.text,
          from: 'psychologist',
          role: 'system',
          timestamp: Date.now(),
          metadata: {
            riskLevel: context.riskLevel,
          },
        });

        // Get final communicator response
        const closingResponse = await this.generateCommunicatorResponse(context);

        return {
          messages: [closingResponse.text],
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

      // Regular response
      const stateTransition = this.stateManager.attemptStateTransition(
        context,
        communicatorResponse.suggestedNextState,
        communicatorResponse.stateReason,
        assessedRisk,
      );

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

      // Schedule background analysis if needed
      if (this.shouldTriggerBackgroundAnalysis(context, communicatorResponse)) {
        await this.scheduleBackgroundAnalysis(context);
      }

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
      const errorResponse = await this.generateCommunicatorResponse(context);
      return {
        messages: [errorResponse.text],
        riskLevel: 'LOW',
      };
    }
  }

  private async integrateBackgroundTasks(context: ConversationContext): Promise<void> {
    const tasks = this.backgroundTaskManager.getTasksForContext(context.userId);
    const completedTasks = tasks.filter((task) => task.status === 'completed');

    for (const task of completedTasks) {
      if (task.type === 'analysis') {
        const analysis = task.result as PsychologistResponse;

        // Store psychologist's analysis in history
        context.history.push({
          text: analysis.text,
          from: 'psychologist',
          role: 'system',
          timestamp: Date.now(),
          metadata: {
            riskLevel: analysis.riskLevel,
            stateTransition: {
              from: context.state,
              to: analysis.nextState,
              reason: analysis.stateReason,
            },
          },
        });

        // Get communicator to rephrase if needed
        const userResponse = await this.generateCommunicatorResponse(context);
        context.history.push({
          text: userResponse.text,
          from: 'assistant',
          role: 'assistant',
          timestamp: Date.now(),
          metadata: {
            riskLevel: userResponse.urgency,
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
