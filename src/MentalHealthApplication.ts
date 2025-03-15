import { ConversationService } from './application/services/SessionOrchestrator';
import { MessageValidator } from './shared/utils/safety-filter';
import { MessageFactory } from './domain/aggregates/conversation/entities/Message';
import { RiskAssessor } from './domain/services/risk/RiskAssessmentService';
import { EmergencyService } from './application/use-cases/message-processing/HandleEmergencyUseCase';
import { ContextAnalyzer } from './domain/services/analysis/CognitiveAnalysisService';
import { StateManager } from './domain/services/state/StateTransitionService';
import { ResponseGenerator } from './infrastructure/llm/openai/GptResponseGenerator';
import { PlanService } from './domain/aggregates/therapy/services/PlanEvolutionService';
import { ProgressTracker } from './application/services/ResponseCoordinator';
import { ResponseComposer } from './application/services/ResponseCoordinator';
import { ErrorHandler } from './shared/errors/application-errors';

import {
  ConversationContext,
  UserMessage,
  SessionResponse,
  ProcessingResult,
} from './domain/aggregates/conversation/entities/types';

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
    private emergencyService: EmergencyService,
    private contextAnalyzer: ContextAnalyzer,
    private stateManager: StateManager,
    private responseGenerator: ResponseGenerator,
    private planService: PlanService,
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
  async handleUserMessage(userId: string, message: string): Promise<SessionResponse> {
    try {
      // 1. Retrieve conversation context
      const context = await this.conversationService.getConversationContext(userId);

      // 2. Validate and preprocess input
      // This will sanitize the message and check for inappropriate content
      const sanitizedMessage = this.messageValidator.validateInput(message);
      // It will also normalize text formatting and handle special characters

      // 3. Create message entity
      // Creates a domain entity from the raw message text
      const userMessage = this.messageFactory.createMessage({
        content: sanitizedMessage,
        role: 'user',
        context: context.currentState,
      });
      // Includes metadata about the context and conversation state

      // 4. Core processing pipeline
      // This processes the message through multiple analysis stages
      const processingResult = await this.processMessagePipeline(context, userMessage);
      // See processMessagePipeline method for details

      // 5. Update conversation state
      // Persists the new message and any state changes to the database
      const updatedContext = await this.conversationService.persistConversationFlow(
        context,
        userMessage,
        processingResult,
      );
      // Updates the conversation context with new risk assessments and insights

      // 6. Prepare response
      // Creates the final response package to be sent back to the user
      return this.responseComposer.createResponsePackage(processingResult, updatedContext);
      // Includes therapeutic message, metadata, and progress metrics
    } catch (error) {
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
    message: UserMessage,
  ): Promise<ProcessingResult> {
    // Phase 1: Immediate risk analysis
    // Analyzes the message for potential risk factors and assigns a risk level
    const riskAssessment = await this.riskAssessor.detectImmediateRisk(
      message.content,
      context.riskHistory,
    );
    // Uses NLP and pattern matching to detect concerning content

    // Emergency handling
    // If critical risk is detected, bypass normal pipeline and trigger emergency protocols
    if (riskAssessment.level === 'CRITICAL') {
      return this.emergencyService.handleCriticalSituation(context, message, riskAssessment);
    }
    // This may involve notifying human moderators or providing crisis resources

    // Phase 2: Contextual analysis
    // Analyzes the message in the context of the user's history and therapeutic plan
    const analysis = await this.contextAnalyzer.analyzeMessage(
      message,
      context.therapeuticPlan,
      context.history,
    );
    // Identifies themes, emotional states, and cognitive patterns

    // Phase 3: State management
    // Determines if the conversation state should transition based on the analysis
    const stateTransition = await this.stateManager.determineStateTransition(
      context.currentState,
      analysis.insights,
    );
    // Uses state machine rules to manage the therapeutic flow

    // Phase 4: Therapeutic response generation
    // Generates an appropriate therapeutic response based on:
    const therapeuticResponse = await this.responseGenerator.generateTherapeuticResponse(
      context.currentState,
      analysis,
      stateTransition,
    );
    // - Current conversation state
    // - Risk assessment
    // - Contextual analysis
    // - Therapeutic plan goals

    // Phase 5: Plan evolution
    // Evaluates if the therapeutic plan needs revision based on new insights
    const planUpdate = await this.planService.evaluatePlanRevision(
      context.therapeuticPlan,
      therapeuticResponse.insights,
    );
    // May create a new version of the plan with adjusted techniques or goals

    // Phase 6: Session progression
    // Calculates metrics about the session's therapeutic progress
    const sessionProgress = this.progressTracker.calculateSessionMetrics(
      context.history,
      therapeuticResponse,
    );
    // Tracks engagement levels, breakthrough moments, and ongoing challenges

    // Return the complete processing result
    return {
      riskAssessment,
      stateTransition,
      therapeuticResponse,
      planUpdate,
      sessionProgress,
    };
    // This contains all components needed to update the system state and generate a response
  }
}
