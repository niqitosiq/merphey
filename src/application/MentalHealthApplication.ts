import { ConversationService } from './services/ConversationService';
import { MessageValidator } from '../shared/utils/safety-filter';
import { MessageFactory } from '../domain/aggregates/conversation/entities/MessageFactory';
import { RiskAssessor } from '../domain/services/risk/RiskAssessmentService';

import { ContextAnalyzer } from '../domain/services/analysis/CognitiveAnalysisService';
import { StateTransitionService } from '../domain/services/state/StateTransitionService';
import { GptResponseGenerator } from '../infrastructure/llm/openai/GptResponseGenerator';
import { PlanEvolutionService } from '../domain/aggregates/therapy/services/PlanEvolutionService';
import { ProgressTracker } from './services/ProgressTracker';
import { ResponseComposer } from './services/ProgressTracker';
import { ErrorHandler } from '../shared/errors/application-errors';

import {
  ConversationContext,
  SessionResponse,
  ProcessingResult,
} from '../domain/aggregates/conversation/entities/types';
import { Message } from '../domain/aggregates/conversation/entities/Message';

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
    private responseGenerator: GptResponseGenerator,
    private planService: PlanEvolutionService,
    private progressTracker: ProgressTracker,
    private responseComposer: ResponseComposer,
    private errorHandler: ErrorHandler,
  ) {}

  /**
   * Primary application entry point for handling user messages
   * @param userId - The user identifier
   * @param message - The raw user message text
   * @returns SessionResponse - Contains therapeutic response and updated context
   */
  async handleMessage(userId: string, message: string): Promise<SessionResponse> {
    try {
      // 1. Retrieve conversation context
      const context = await this.conversationService.getConversationContext(userId);

      // 2. Validate and preprocess input
      // This will sanitize the message and check for inappropriate content
      const sanitizedMessage = this.messageValidator.validateInput(message);
      // It will also normalize text formatting and handle special characters

      // 3. Create message entity
      // Creates a domain entity from the raw message text
      const Message = this.messageFactory.createMessage({
        content: sanitizedMessage,
        role: 'user',
        conversationId: context.conversationId,
        metadata: {},
      });
      // Includes metadata about the context and conversation state

      // 4. Core processing pipeline
      // This processes the message through multiple analysis stages
      const processingResult = await this.processMessagePipeline(context, Message);
      // See processMessagePipeline method for details

      // 5. Update conversation state
      // Persists the new message and any state changes to the database
      const updatedContext = await this.conversationService.persistConversationFlow(
        context,
        Message,
        processingResult,
      );
      // Updates the conversation context with new risk assessments and insights

      // 6. Prepare response
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
    const [riskAssessment, stateTransition, analysis] = await Promise.all([
      this.riskAssessor.detectImmediateRisk(message.content, context.riskHistory),
      this.stateManager.determineTransition(context),
      this.contextAnalyzer.analyzeMessage(
        message,
        context.therapeuticPlan || null,
        context.history,
      ),
    ]);

    const [therapeuticResponse, updatedVersion] = await Promise.all([
      this.responseGenerator.generateTherapeuticResponse(context.currentState, analysis),
      this.planService.revisePlan(context.therapeuticPlan, context, analysis),
    ]);

    const sessionProgress = this.progressTracker.calculateSessionMetrics(
      context.history,
      therapeuticResponse,
    );

    return {
      riskAssessment,
      stateTransition,
      therapeuticResponse,
      updatedVersion,
      sessionProgress,
    };
  }

  /**
   * Starts a new therapy session for a user
   * @param userId - The user identifier
   * @returns Promise<void>
   */
  async startSession(userId: string): Promise<void> {
    try {
      // Create initial conversation context if it doesn't exist
      const existingContext = await this.conversationService.getConversationContext(userId);
      if (!existingContext) {
        await this.conversationService.initializeConversationContext(userId);
      }
    } catch (error: any) {
      this.errorHandler.handleProcessingError(error, userId);
    }
  }

  /**
   * Retrieves user session information including conversation state and progress
   * @param userId - The user identifier
   * @returns Promise<UserInfo> - User session information
   */
  async getUserInfo(userId: string) {
    try {
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
