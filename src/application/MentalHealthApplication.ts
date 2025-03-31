import { MessageFactory } from '../domain/aggregates/conversation/entities/MessageFactory';
import { RiskAssessor } from '../domain/services/risk/RiskAssessmentService';
import { SessionService } from '../domain/services/session/SessionService';
import { MessageValidator } from '../shared/utils/safety-filter';
import { ConversationService } from './services/ConversationService';

import { ContextAnalyzer } from '../domain/services/analysis/CognitiveAnalysisService';
import { StateTransitionService } from '../domain/services/state/StateTransitionService';

import { PlanEvolutionService } from '../domain/services/analysis/PlanEvolutionService';
import { ErrorHandler } from '../shared/errors/application-errors';
import { ProgressTracker, ResponseComposer } from './services/ProgressTracker';

import { TherapistService } from 'src/domain/services/analysis/TherapistService';
import { EventBus } from 'src/shared/events/EventBus';
import { Message } from '../domain/aggregates/conversation/entities/Message';
import {
  ConversationContext,
  ProcessingResult,
  SessionResponse,
  TherapeuticResponse,
} from '../domain/aggregates/conversation/entities/types';

/**
 * Main application class that orchestrates the mental health chatbot workflow
 * This is the core entry point for processing user messages and generating therapeutic responses
 */
export class MentalHealthApplication {
  constructor(
    private conversationService: ConversationService,
    private messageValidator: MessageValidator,
    private messageFactory: MessageFactory,
    private riskAssessor: RiskAssessor,
    private contextAnalyzer: ContextAnalyzer,
    private stateManager: StateTransitionService,
    private responseGenerator: TherapistService,
    private planService: PlanEvolutionService,
    private progressTracker: ProgressTracker,
    private responseComposer: ResponseComposer,
    private errorHandler: ErrorHandler,
    private eventBus: EventBus,
    private sessionService: SessionService,
  ) {}

  /**
   * Primary application entry point for handling user messages
   * @param userId - The user identifier
   * @param message - The raw user message text
   * @returns SessionResponse - Contains therapeutic response and updated context
   */
  async handleMessage(userId: string, message: string): Promise<SessionResponse> {
    try {
      // 3. Retrieve conversation context
      const context = await this.conversationService.getConversationContext(userId);

      if (!context) {
        // If no context is found, create a new one
        throw new Error('No conversation context found for user.');
      }

      // 4. Validate and preprocess input
      // This will sanitize the message and check for inappropriate content
      const sanitizedMessage = this.messageValidator.validateInput(message);
      // It will also normalize text formatting and handle special characters

      // 5. Create message entity
      // Creates a domain entity from the raw message text
      const Message = this.messageFactory.createMessage({
        content: sanitizedMessage,
        role: 'user',
        conversationId: context.conversationId,
        metadata: {},
      });
      // Includes metadata about the context and conversation state

      // 6. Core processing pipeline
      // This processes the message through multiple analysis stages
      const processingResult = await this.processMessagePipeline(context, Message);
      // See processMessagePipeline method for details

      // 7. Update conversation state
      // Persists the new message and any state changes to the database
      const updatedContext = await this.conversationService.persistConversationFlow(
        context,
        Message,
        processingResult,
      );
      // Updates the conversation context with new risk assessments and insights

      // 8. Prepare response
      // Creates the final response package to be sent back to the user
      return this.responseComposer.createResponsePackage(processingResult, updatedContext);
      // Includes therapeutic message, metadata, and progress metrics
    } catch (error: any) {
      // Handle errors and generate appropriate fallback responses
      return this.errorHandler.handleProcessingError(error, userId);
      // Will log errors and possibly alert administrators for critical failures
    }
  }

  /**
   * Core message processing pipeline
   * Handles risk assessment, contextual analysis, state management, response generation,
   * therapeutic plan evolution and session progress tracking
   * @param context - Current conversation context
   * @param message - The processed user message
   * @returns ProcessingResult - The complete result of all analysis stages
   */
  private async processMessagePipeline(
    context: ConversationContext,
    message: Message,
  ): Promise<ProcessingResult> {
    const riskAssessment = await this.riskAssessor.detectImmediateRisk(
      message.content,
      context.riskHistory,
    );

    this.eventBus.publish('SEND_TYPING', {
      userId: context.userId,
      durationMs: 5000,
    });
    const analysis = await this.contextAnalyzer.analyzeMessage(
      message,
      context.therapeuticPlan || null,
      context.history,
    );

    const stateTransition = await this.stateManager.determineTransition(context, analysis);

    let therapeuticResponse: TherapeuticResponse;
    if (analysis.shouldBeRevised) {
      this.eventBus.publish('ASK_USER_TO_WAIT', {
        userId: context.userId,
        message: 'Мне нужно подумать... Пожалуйста, подождите',
      });
      const updatedVersion = await this.planService.revisePlan(
        context.therapeuticPlan,
        context,
        message,
      );

      if (!updatedVersion.content.goals) {
        throw new Error('Updated version does not contain goals.');
      }

      this.eventBus.publish('SEND_TYPING', {
        userId: context.userId,
        durationMs: 5000,
      });
      therapeuticResponse = await this.responseGenerator.generateResponse(
        context,
        {
          language: analysis.language,
          nextGoal: updatedVersion.content.goals[0]?.codename,
          shouldBeRevised: false,
        },
        updatedVersion,
        message,
      );

      const sessionProgress = this.progressTracker.calculateSessionMetrics(
        context.history,
        therapeuticResponse,
      );

      this.eventBus.publish('SEND_TYPING', {
        userId: context.userId,
        durationMs: 5000,
      });

      return {
        riskAssessment,
        stateTransition,
        therapeuticResponse,
        updatedVersion,
        sessionProgress,
      };
    }

    therapeuticResponse = await this.responseGenerator.generateResponse(
      context,
      analysis,
      context.therapeuticPlan.currentVersion,
      message,
    );

    const sessionProgress = this.progressTracker.calculateSessionMetrics(
      context.history,
      therapeuticResponse,
    );

    return {
      riskAssessment,
      stateTransition,
      therapeuticResponse,
      updatedVersion: null,
      sessionProgress,
    };
  }

  /**
   * Retrieves user session information including conversation state and progress
   * @param userId - The user identifier
   * @returns Promise<UserInfo> - User session information
   */
  async getUserInfo(userId: string) {
    try {
      const user = await this.conversationService.getUserById(userId);

      if (!user) {
        await this.conversationService.createUser(userId);
      }

      const context = await this.conversationService.getConversationContext(userId);

      if (!context) {
        return null;
      }

      // Get session statistics
      const stats = await this.progressTracker.getSessionStats(context);

      // Get current therapeutic plan if exists
      const plan = context.therapeuticPlan;

      // Get progress insights if available
      const progress = await this.progressTracker.getProgressInsights(context);

      return {
        user,
        conversation: {
          state: context.currentState,
          id: context.conversationId,
        },
        stats: {
          messageCount: stats.totalMessages,
          sessionDuration: stats.duration,
        },
        plan: plan,
        progress: progress,
      };
    } catch (error: any) {
      this.errorHandler.handleProcessingError(error, userId);
      return null;
    }
  }

  /**
   * Resets the current conversation state for a user
   * @param userId - The user identifier
   * @returns Promise<void>
   */
  async resetConversationState(userId: string): Promise<void> {
    try {
      await this.conversationService.resetConversationState(userId);
    } catch (error: any) {
      this.errorHandler.handleProcessingError(error, userId);
    }
  }
}
