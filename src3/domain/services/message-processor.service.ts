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
import { Logger } from '../../utils/logger';

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
  private readonly logger = Logger.getInstance();

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
    const startTime = Date.now();
    this.logger.info('Starting message processing', {
      userId: context.userId,
      messageText: message.text,
      currentState: context.state,
      riskLevel: context.riskLevel,
    });

    try {
      // Block user messages during analysis
      if (
        message.from === 'user' &&
        (context.state === ConversationState.PENDING_ANALYSIS ||
          context.state === ConversationState.DEEP_ANALYSIS)
      ) {
        return {
          messages: ['Please wait while I analyze the situation to provide better assistance...'],
          riskLevel: context.riskLevel,
        };
      }

      if (context.activeGuidance?.prompt && message.from === 'user') {
        message.metadata = {
          ...message.metadata,
          guidance: {
            prompt: context.activeGuidance.prompt,
            currentStep: context.activeGuidance.currentStep,
            stepProgress: context.activeGuidance.stepProgress,
            therapeuticPlan: context.activeGuidance.therapeuticPlan,
            safetyRecommendations: context.activeGuidance.safetyRecommendations,
          },
        };
      }

      // First get communicator's assessment
      this.logger.debug('Generating initial communicator response', { userId: context.userId });
      const communicatorResponse = await this.generateCommunicatorResponse(context);
      this.logger.debug('Received communicator response', {
        userId: context.userId,
        suggestedState: communicatorResponse.suggestedNextState,
        urgency: communicatorResponse.urgency,
        currentStep: communicatorResponse.currentActionStep,
        stepProgress: communicatorResponse.stepProgress,
      });

      // If analysis is needed, transition to PENDING_ANALYSIS and trigger immediate analysis
      if (
        communicatorResponse.suggestedNextState === ConversationState.ANALYSIS_NEEDED ||
        communicatorResponse.suggestedNextState === ConversationState.PENDING_ANALYSIS
      ) {
        // Transition to pending analysis state
        const stateTransition = this.stateManager.attemptStateTransition(
          context,
          ConversationState.PENDING_ANALYSIS,
          'Immediate analysis required: ' + communicatorResponse.stateReason,
          communicatorResponse.urgency,
        );

        if (stateTransition) {
          message.metadata = {
            ...message.metadata,
            stateTransition: {
              from: stateTransition.from,
              to: stateTransition.to,
              reason: stateTransition.reason,
            },
          };

          // Generate immediate analysis
          const analysis = await this.generatePsychologistResponse(context);

          // Store analysis and update active guidance
          context.activeGuidance = {
            prompt: analysis.prompt,
            currentStep: 1, // Start with first step
            stepProgress: 'Starting action chain',
            therapeuticPlan: analysis.therapeuticPlan || '',
            safetyRecommendations: analysis.safetyRecommendations || [],
          };

          // Store analysis in history
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
              guidance: {
                prompt: analysis.prompt,
                therapeuticPlan: analysis.therapeuticPlan,
                safetyRecommendations: analysis.safetyRecommendations,
                currentStep: 1,
                stepProgress: 'Starting action chain',
              },
            },
          });

          // Transition to next state based on analysis
          const postAnalysisTransition = this.stateManager.attemptStateTransition(
            context,
            analysis.nextState,
            analysis.stateReason,
            analysis.riskLevel,
          );

          // Get communicator to rephrase analysis insights and start action chain
          const updatedResponse = await this.generateCommunicatorResponse(context);

          // Update active guidance progress if communicator made progress
          if (updatedResponse.currentActionStep && updatedResponse.stepProgress) {
            context.activeGuidance.currentStep = updatedResponse.currentActionStep;
            context.activeGuidance.stepProgress = updatedResponse.stepProgress;
          }

          return {
            messages: [updatedResponse.text],
            riskLevel: analysis.riskLevel,
            transition: {
              reason: postAnalysisTransition?.reason || analysis.stateReason,
              state: postAnalysisTransition?.to || context.state,
            },
            metrics: {
              engagementLevel: updatedResponse.engagementLevel,
              emotionalTone: updatedResponse.emotionalTone,
            },
          };
        }
      }

      // Check for completed background tasks
      this.logger.debug('Checking background tasks', { userId: context.userId });
      await this.integrateBackgroundTasks(context);

      // Assess risk level
      this.logger.debug('Assessing risk level', {
        userId: context.userId,
        currentRisk: context.riskLevel,
        suggestedRisk: communicatorResponse.urgency,
      });
      const assessedRisk = this.stateManager.assessRiskLevel(
        context.riskLevel || 'LOW',
        context.history,
        communicatorResponse.urgency,
      );
      this.logger.info('Risk assessment complete', {
        userId: context.userId,
        previousRisk: context.riskLevel,
        assessedRisk,
      });

      // Handle high risk situations internally
      if (assessedRisk === 'HIGH' || assessedRisk === 'CRITICAL') {
        this.logger.warn('High risk situation detected', {
          userId: context.userId,
          riskLevel: assessedRisk,
        });
        const analysis = await this.generatePsychologistResponse(context);
        this.logger.debug('Received psychologist analysis for high risk', {
          userId: context.userId,
          analysis: analysis.text,
          recommendations: analysis.safetyRecommendations,
        });

        // Store analysis but don't show to user
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

        // Get new communicator response with analysis context
        this.logger.debug('Generating updated communicator response for high risk', {
          userId: context.userId,
        });
        const updatedResponse = await this.generateCommunicatorResponse(context);

        const processingTime = Date.now() - startTime;
        this.logger.info('Completed high-risk message processing', {
          userId: context.userId,
          processingTimeMs: processingTime,
          finalState: analysis.nextState,
          riskLevel: analysis.riskLevel,
        });

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
        this.logger.info('Processing session closing', { userId: context.userId });
        const finishingResponse = await this.generateFinishingResponse(context);
        this.logger.debug('Generated finishing response', {
          userId: context.userId,
          metrics: finishingResponse.summaryMetrics,
        });

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

        const processingTime = Date.now() - startTime;
        this.logger.info('Completed session closing', {
          userId: context.userId,
          processingTimeMs: processingTime,
          sessionProgress: finishingResponse.summaryMetrics?.progressMade,
          riskTrend: finishingResponse.summaryMetrics?.riskTrend,
        });

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
      this.logger.debug('Processing regular response', { userId: context.userId });
      const stateTransition = this.stateManager.attemptStateTransition(
        context,
        communicatorResponse.suggestedNextState,
        communicatorResponse.stateReason,
        assessedRisk,
      );

      if (stateTransition) {
        this.logger.info('State transition occurred', {
          userId: context.userId,
          from: stateTransition.from,
          to: stateTransition.to,
          reason: stateTransition.reason,
        });

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
        this.logger.debug('Scheduling background analysis', { userId: context.userId });
        await this.scheduleBackgroundAnalysis(context);
      }

      // Update active guidance progress if communicator made progress
      if (
        communicatorResponse.currentActionStep &&
        communicatorResponse.stepProgress &&
        context.activeGuidance
      ) {
        context.activeGuidance.currentStep = communicatorResponse.currentActionStep;
        context.activeGuidance.stepProgress = communicatorResponse.stepProgress;
      }

      const processingTime = Date.now() - startTime;
      this.logger.info('Completed message processing', {
        userId: context.userId,
        processingTimeMs: processingTime,
        finalState: stateTransition?.to || context.state,
        riskLevel: assessedRisk,
      });

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
      this.logger.error('Error processing message', {
        userId: context.userId,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      });

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

        // Update active guidance if new guidance is provided
        if (analysis.prompt) {
          context.activeGuidance = {
            prompt: analysis.prompt,
            currentStep: 1,
            stepProgress: 'Starting action chain',
            therapeuticPlan: analysis.therapeuticPlan || '',
            safetyRecommendations: analysis.safetyRecommendations || [],
          };
        }

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
            guidance: context.activeGuidance
              ? {
                  prompt: context.activeGuidance.prompt,
                  therapeuticPlan: context.activeGuidance.therapeuticPlan,
                  safetyRecommendations: context.activeGuidance.safetyRecommendations,
                  currentStep: context.activeGuidance.currentStep,
                  stepProgress: context.activeGuidance.stepProgress,
                }
              : undefined,
          },
        });

        // Get communicator to rephrase if needed
        const userResponse = await this.generateCommunicatorResponse(context);

        // Update active guidance progress if communicator made progress
        if (userResponse.currentActionStep && userResponse.stepProgress && context.activeGuidance) {
          context.activeGuidance.currentStep = userResponse.currentActionStep;
          context.activeGuidance.stepProgress = userResponse.stepProgress;
        }

        context.history.push({
          text: userResponse.text,
          from: 'assistant',
          role: 'assistant',
          timestamp: Date.now(),
          metadata: {
            riskLevel: userResponse.urgency,
            guidance: context.activeGuidance
              ? {
                  prompt: context.activeGuidance.prompt,
                  currentStep: context.activeGuidance.currentStep,
                  stepProgress: context.activeGuidance.stepProgress,
                  therapeuticPlan: context.activeGuidance.therapeuticPlan,
                  safetyRecommendations: context.activeGuidance.safetyRecommendations,
                }
              : undefined,
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

    // Count meaningful messages (excluding greetings, etc)
    const meaningfulMessages = context.history.filter(
      (msg) => msg.from === 'user' && msg.text.length > 20,
    ).length;

    // Always trigger immediate analysis for PENDING_ANALYSIS state
    if (context.state === ConversationState.PENDING_ANALYSIS) {
      return true;
    }

    // Trigger analysis more aggressively in early conversation
    if (meaningfulMessages <= 5) {
      return timeSinceLastAnalysis > 2 * 60 * 1000; // 30 seconds for first few messages
    }

    // Regular triggers
    return (
      timeSinceLastAnalysis > 10 * 60 * 1000 && // Reduced from 5 to 2 minutes
      (response.suggestedNextState === ConversationState.ANALYSIS_NEEDED ||
        response.engagementLevel === 'LOW' ||
        response.riskFactors.length > 0 ||
        context.state === ConversationState.GATHERING_INFO || // Always analyze in gathering state
        !context.therapeuticPlan) // Trigger if no plan exists
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
