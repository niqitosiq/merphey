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

// Constants
const PENDING_ANALYSIS_TIMEOUT_MS = 60000; // 1 minute timeout for pending analysis state

export interface MessageProcessorConfig {
  lowTierModel: string;
  highTierModel: string;
  enableBackgroundProcessing?: boolean;
  maxBackgroundTasks?: number;
  backgroundTaskTimeoutMs?: number;
  pendingAnalysisTimeoutMs?: number; // Add timeout configuration
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
  private readonly pendingAnalysisTimeoutMs: number;

  constructor(
    private readonly stateManager: StateManager,
    private readonly llmService: LlmService,
    private readonly config: MessageProcessorConfig,
  ) {
    this.backgroundTaskManager = new BackgroundTaskManager(
      config.backgroundTaskTimeoutMs || 5 * 60 * 1000,
    );
    this.pendingAnalysisTimeoutMs = config.pendingAnalysisTimeoutMs || PENDING_ANALYSIS_TIMEOUT_MS;
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
      // Check if we need to fix the state based on history
      this.syncStateWithHistory(context);

      // Check if we're in a stalled analysis state and recover if needed
      if (this.isPendingAnalysisStalled(context)) {
        this.logger.warn('Pending analysis state timed out, forcing recovery', {
          userId: context.userId,
          stateBeforeRecovery: context.state,
        });

        await this.recoverFromStalledAnalysis(context);
      }

      // Block user messages during analysis states
      if (this.isMessageBlockedDuringAnalysis(message, context)) {
        // Schedule a background task to handle the analysis anyway
        await this.scheduleBackgroundAnalysis(context);

        // Update the last analysis timestamp to prevent reprocessing too soon
        context.lastAnalysisTimestamp = Date.now();

        return this.getWaitingForAnalysisResponse(context);
      }

      // Add active guidance metadata to message if applicable
      this.addGuidanceMetadataToMessage(message, context);

      // Generate initial communicator response
      this.logger.debug('Generating initial communicator response', { userId: context.userId });
      const communicatorResponse = await this.generateCommunicatorResponse(context);
      this.logCommunicatorResponse(context, communicatorResponse);

      // Handle immediate analysis need
      if (this.isImmediateAnalysisNeeded(communicatorResponse)) {
        return await this.handleImmediateAnalysis(context, message, communicatorResponse);
      }

      // Check for completed background tasks
      this.logger.debug('Checking background tasks', { userId: context.userId });
      await this.integrateBackgroundTasks(context);

      // Assess risk level
      const assessedRisk = this.assessRiskLevel(context, communicatorResponse);

      // Handle high risk situations
      if (this.isHighRiskSituation(assessedRisk)) {
        return await this.handleHighRiskSituation(context, assessedRisk);
      }

      // Handle session closing
      if (context.state === ConversationState.SESSION_CLOSING) {
        return await this.handleSessionClosing(context, startTime);
      }

      // Regular response handling
      return await this.handleRegularResponse(
        context,
        message,
        communicatorResponse,
        assessedRisk,
        startTime,
      );
    } catch (error) {
      return await this.handleProcessingError(context, error);
    }
  }

  // Helper methods for message processing logic

  private isMessageBlockedDuringAnalysis(
    message: HistoryMessage,
    context: ConversationContext,
  ): boolean {
    // Only block if we're in an analysis state and it's a user message
    if (
      message.from !== 'user' ||
      (context.state !== ConversationState.PENDING_ANALYSIS &&
        context.state !== ConversationState.DEEP_ANALYSIS)
    ) {
      return false;
    }

    // Find the most recent state transition to PENDING_ANALYSIS
    const pendingAnalysisTransition = context.history
      .slice()
      .reverse()
      .find((msg) => msg.metadata?.stateTransition?.to === ConversationState.PENDING_ANALYSIS);

    // Find the most recent psychologist analysis
    const lastAnalysis = context.history
      .slice()
      .reverse()
      .find((msg) => msg.from === 'psychologist');

    // If we have both a transition and an analysis
    if (pendingAnalysisTransition && lastAnalysis) {
      // If the analysis is newer than the transition to PENDING_ANALYSIS
      if (lastAnalysis.timestamp > pendingAnalysisTransition.timestamp) {
        this.logger.info('Analysis already complete, not blocking message', {
          userId: context.userId,
          analysisTime: lastAnalysis.timestamp,
          transitionTime: pendingAnalysisTransition.timestamp,
        });

        // Process the recommended state transition if available
        if (lastAnalysis.metadata?.stateTransition?.to) {
          const recommendedState = lastAnalysis.metadata.stateTransition.to;
          const recommendedReason = lastAnalysis.metadata.stateTransition.reason;
          const riskLevel = lastAnalysis.metadata.riskLevel || context.riskLevel;

          const stateTransition = this.stateManager.attemptStateTransition(
            context,
            recommendedState,
            recommendedReason || 'Processing completed analysis',
            riskLevel,
          );

          if (stateTransition) {
            this.logger.info('Applied pending state transition from analysis', {
              userId: context.userId,
              from: stateTransition.from,
              to: stateTransition.to,
              reason: stateTransition.reason,
            });
          }
        }

        return false;
      }
    }

    // If we're in PENDING_ANALYSIS but have no record of transitioning to it,
    // there may be a state inconsistency, so don't block
    if (!pendingAnalysisTransition && context.state === ConversationState.PENDING_ANALYSIS) {
      this.logger.warn('State inconsistency: in PENDING_ANALYSIS without transition record', {
        userId: context.userId,
      });

      // Force transition to GUIDANCE_DELIVERY
      this.stateManager.attemptStateTransition(
        context,
        ConversationState.GUIDANCE_DELIVERY,
        'Recovered from inconsistent analysis state',
        context.riskLevel,
      );

      return false;
    }

    // Block message - we're in an analysis state and analysis is not complete
    return true;
  }

  private getWaitingForAnalysisResponse(context: ConversationContext): ProcessedResponse {
    // Find out how long we've been waiting
    const pendingAnalysisTransition = context.history
      .slice()
      .reverse()
      .find((msg) => msg.metadata?.stateTransition?.to === ConversationState.PENDING_ANALYSIS);

    let message = 'Please wait while I analyze the situation to provide better assistance...';

    if (pendingAnalysisTransition) {
      const timeWaiting = Math.round((Date.now() - pendingAnalysisTransition.timestamp) / 1000);

      // If we've been waiting more than 20 seconds, give a more detailed message
      if (timeWaiting > 20) {
        message = `I'm still working on analyzing your situation (${timeWaiting} seconds). This might take a bit longer than usual, but I'll respond as soon as possible.`;
      }
    }

    return {
      messages: [message],
      riskLevel: context.riskLevel,
    };
  }

  private addGuidanceMetadataToMessage(
    message: HistoryMessage,
    context: ConversationContext,
  ): void {
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
  }

  private logCommunicatorResponse(
    context: ConversationContext,
    response: CommunicatorResponse,
  ): void {
    this.logger.debug('Received communicator response', {
      userId: context.userId,
      suggestedState: response.suggestedNextState,
      urgency: response.urgency,
      currentStep: response.currentActionStep,
      stepProgress: response.stepProgress,
    });
  }

  private isImmediateAnalysisNeeded(response: CommunicatorResponse): boolean {
    return (
      response.suggestedNextState === ConversationState.ANALYSIS_NEEDED ||
      response.suggestedNextState === ConversationState.PENDING_ANALYSIS
    );
  }

  private async handleImmediateAnalysis(
    context: ConversationContext,
    message: HistoryMessage,
    communicatorResponse: CommunicatorResponse,
  ): Promise<ProcessedResponse> {
    // Transition to pending analysis state
    const stateTransition = this.stateManager.attemptStateTransition(
      context,
      ConversationState.PENDING_ANALYSIS,
      'Immediate analysis required: ' + communicatorResponse.stateReason,
      communicatorResponse.urgency,
    );

    if (!stateTransition) {
      return {
        messages: [communicatorResponse.text],
        riskLevel: context.riskLevel,
      };
    }

    // Add transition metadata to message
    this.addTransitionMetadataToMessage(message, stateTransition);

    // Generate immediate analysis
    const analysis = await this.generatePsychologistResponse(context);

    // Set up active guidance
    this.updateActiveGuidance(context, analysis);

    // Store analysis in history
    this.addAnalysisToHistory(context, analysis);

    // Transition to next state based on analysis
    const postAnalysisTransition = this.stateManager.attemptStateTransition(
      context,
      analysis.nextState,
      analysis.stateReason,
      analysis.riskLevel,
    );

    // Get communicator to rephrase analysis insights and start action chain
    const updatedResponse = await this.generateCommunicatorResponse(context);

    // Update active guidance progress
    this.updateGuidanceProgress(context, updatedResponse);

    // Update the last analysis timestamp when we perform analysis
    context.lastAnalysisTimestamp = Date.now();

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

  private addTransitionMetadataToMessage(
    message: HistoryMessage,
    transition: { from: ConversationState; to: ConversationState; reason: string },
  ): void {
    message.metadata = {
      ...message.metadata,
      stateTransition: {
        from: transition.from,
        to: transition.to,
        reason: transition.reason,
      },
    };
  }

  private updateActiveGuidance(context: ConversationContext, analysis: PsychologistResponse): void {
    context.activeGuidance = {
      prompt: analysis.prompt,
      currentStep: 1, // Start with first step
      stepProgress: 'Starting action chain',
      therapeuticPlan: analysis.therapeuticPlan || '',
      safetyRecommendations: analysis.safetyRecommendations || [],
    };
  }

  private addAnalysisToHistory(context: ConversationContext, analysis: PsychologistResponse): void {
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
  }

  private assessRiskLevel(
    context: ConversationContext,
    communicatorResponse: CommunicatorResponse,
  ): RiskLevel {
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

    return assessedRisk;
  }

  private isHighRiskSituation(riskLevel: RiskLevel): boolean {
    return riskLevel === 'HIGH' || riskLevel === 'CRITICAL';
  }

  private async handleHighRiskSituation(
    context: ConversationContext,
    assessedRisk: RiskLevel,
  ): Promise<ProcessedResponse> {
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
    this.addSystemAnalysisToHistory(context, analysis);

    // Get new communicator response with analysis context
    this.logger.debug('Generating updated communicator response for high risk', {
      userId: context.userId,
    });
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

  private addSystemAnalysisToHistory(
    context: ConversationContext,
    analysis: PsychologistResponse,
  ): void {
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
  }

  private async handleSessionClosing(
    context: ConversationContext,
    startTime: number,
  ): Promise<ProcessedResponse> {
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

  private async handleRegularResponse(
    context: ConversationContext,
    message: HistoryMessage,
    communicatorResponse: CommunicatorResponse,
    assessedRisk: RiskLevel,
    startTime: number,
  ): Promise<ProcessedResponse> {
    this.logger.debug('Processing regular response', { userId: context.userId });

    const stateTransition = this.stateManager.attemptStateTransition(
      context,
      communicatorResponse.suggestedNextState,
      communicatorResponse.stateReason,
      assessedRisk,
    );

    if (stateTransition) {
      this.logStateTransition(context, stateTransition);
      this.updateMessageWithTransitionMetadata(message, stateTransition, communicatorResponse);
    }

    // Schedule background analysis if needed
    if (this.shouldTriggerBackgroundAnalysis(context, communicatorResponse)) {
      this.logger.debug('Scheduling background analysis', { userId: context.userId });
      await this.scheduleBackgroundAnalysis(context);
    }

    // Update active guidance progress
    this.updateGuidanceProgress(context, communicatorResponse);

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
  }

  private logStateTransition(
    context: ConversationContext,
    transition: { from: ConversationState; to: ConversationState; reason: string },
  ): void {
    this.logger.info('State transition occurred', {
      userId: context.userId,
      from: transition.from,
      to: transition.to,
      reason: transition.reason,
    });
  }

  private updateMessageWithTransitionMetadata(
    message: HistoryMessage,
    transition: { from: ConversationState; to: ConversationState; reason: string },
    communicatorResponse: CommunicatorResponse,
  ): void {
    message.metadata = {
      ...message.metadata,
      stateTransition: {
        from: transition.from,
        to: transition.to,
        reason: transition.reason,
      },
      emotionalTone: communicatorResponse.emotionalTone,
      riskFactors: communicatorResponse.riskFactors,
    };
  }

  private updateGuidanceProgress(
    context: ConversationContext,
    response: CommunicatorResponse,
  ): void {
    if (response.currentActionStep && response.stepProgress && context.activeGuidance) {
      context.activeGuidance.currentStep = response.currentActionStep;
      context.activeGuidance.stepProgress = response.stepProgress;
    }
  }

  private async handleProcessingError(
    context: ConversationContext,
    error: unknown,
  ): Promise<ProcessedResponse> {
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

  private async integrateBackgroundTasks(context: ConversationContext): Promise<void> {
    const tasks = this.backgroundTaskManager.getTasksForContext(context.userId);
    const completedTasks = tasks.filter((task) => task.status === 'completed');

    for (const task of completedTasks) {
      if (task.type === 'analysis') {
        const analysis = task.result as PsychologistResponse;

        // Update active guidance if new guidance is provided
        if (analysis.prompt) {
          this.updateActiveGuidance(context, analysis);
        }

        // Always attempt to transition based on analysis recommendation
        const postAnalysisTransition = this.stateManager.attemptStateTransition(
          context,
          analysis.nextState,
          analysis.stateReason,
          analysis.riskLevel,
        );

        if (postAnalysisTransition) {
          this.logger.info('Applied state transition from background analysis', {
            userId: context.userId,
            from: postAnalysisTransition.from,
            to: postAnalysisTransition.to,
            reason: postAnalysisTransition.reason,
          });
        }

        // Store psychologist's analysis in history
        this.addBackgroundAnalysisToHistory(context, analysis);

        // Get communicator to rephrase if needed
        const userResponse = await this.generateCommunicatorResponse(context);

        // Update active guidance progress
        this.updateGuidanceProgress(context, userResponse);

        // Add communicator response to history
        this.addCommunicatorResponseToHistory(context, userResponse);

        // Remove the task from active tasks if it's being tracked
        if (context.activeBackgroundTasks) {
          context.activeBackgroundTasks = context.activeBackgroundTasks.filter(
            (id) => id !== task.id,
          );
        }
      }
    }
  }

  private addBackgroundAnalysisToHistory(
    context: ConversationContext,
    analysis: PsychologistResponse,
  ): void {
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
  }

  private addCommunicatorResponseToHistory(
    context: ConversationContext,
    response: CommunicatorResponse,
  ): void {
    context.history.push({
      text: response.text,
      from: 'assistant',
      role: 'assistant',
      timestamp: Date.now(),
      metadata: {
        riskLevel: response.urgency,
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

  private async scheduleBackgroundAnalysis(context: ConversationContext): Promise<void> {
    const taskId = await this.backgroundTaskManager.scheduleTask('analysis', context.userId, () =>
      this.generatePsychologistResponse(context),
    );

    // Track the task ID in the context
    if (!context.activeBackgroundTasks) {
      context.activeBackgroundTasks = [];
    }
    context.activeBackgroundTasks.push(taskId);

    // Update the timestamp when analysis was last scheduled
    context.lastAnalysisTimestamp = Date.now();
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

  private isPendingAnalysisStalled(context: ConversationContext): boolean {
    if (context.state !== ConversationState.PENDING_ANALYSIS) {
      return false;
    }

    // Check when we last transitioned to this state
    const pendingAnalysisTransition = context.history
      .slice()
      .reverse()
      .find((msg) => msg.metadata?.stateTransition?.to === ConversationState.PENDING_ANALYSIS);

    if (!pendingAnalysisTransition) {
      // Can't find when we transitioned, assume not stalled
      return false;
    }

    const timeInPendingAnalysis = Date.now() - pendingAnalysisTransition.timestamp;
    return timeInPendingAnalysis > this.pendingAnalysisTimeoutMs;
  }

  private async recoverFromStalledAnalysis(context: ConversationContext): Promise<void> {
    // Force transition to guidance delivery state
    const stateTransition = this.stateManager.attemptStateTransition(
      context,
      ConversationState.GUIDANCE_DELIVERY,
      'Recovered from stalled analysis state',
      context.riskLevel,
    );

    // If we couldn't transition normally, force an error recovery
    if (!stateTransition) {
      context.state = ConversationState.ERROR_RECOVERY;
      this.logger.warn('Forced error recovery from stalled analysis', {
        userId: context.userId,
      });
    }

    // Log the recovery
    this.logger.info('Recovered from stalled pending analysis', {
      userId: context.userId,
      newState: context.state,
    });

    // Add recovery message to history
    context.history.push({
      text: 'System recovered from pending analysis',
      from: 'psychologist',
      role: 'system',
      timestamp: Date.now(),
      metadata: {
        riskLevel: context.riskLevel,
        stateTransition: {
          from: ConversationState.PENDING_ANALYSIS,
          to: context.state,
          reason: 'Recovery from stalled analysis',
        },
      },
    });

    // Update last analysis timestamp to allow the system to proceed
    context.lastAnalysisTimestamp = Date.now();
  }

  // LLM response generation methods

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

  /**
   * Ensures the conversation state matches the most recent state transition in history
   * Prevents state desynchronization issues that can occur between messages
   */
  private syncStateWithHistory(context: ConversationContext): void {
    // Find the most recent state transition in history
    const lastStateTransition = context.history
      .slice()
      .reverse()
      .find((msg) => msg.metadata?.stateTransition);

    if (lastStateTransition?.metadata?.stateTransition) {
      const transition = lastStateTransition.metadata.stateTransition;

      // If the current state doesn't match the last transition's target state
      if (transition.to !== context.state) {
        this.logger.warn('State desynchronization detected', {
          userId: context.userId,
          currentState: context.state,
          historyTargetState: transition.to,
          transitionTimestamp: lastStateTransition.timestamp,
        });

        // Update the context state to reflect history
        context.state = transition.to;

        this.logger.info('State synchronized from history', {
          userId: context.userId,
          newState: context.state,
        });
      }
    }
  }
}
