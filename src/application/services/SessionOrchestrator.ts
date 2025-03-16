import {
  ConversationContext,
  UserMessage,
  ProcessingResult,
  SessionResponse,
} from '../../domain/aggregates/conversation/entities/types';
import { ConversationRepository } from '../../infrastructure/persistence/postgres/ConversationRepository';
import { TherapeuticPlanRepository } from '../../infrastructure/persistence/postgres/PlanRepository';
import { ContextLoader } from '../../shared/utils/context-loader';
import { ConversationState, RiskLevel } from '@prisma/client';
import { ApplicationError } from '../../shared/errors/application-errors';
import { TherapeuticPlan } from 'src/domain/aggregates/therapy/entities/TherapeuticPlan';
import { Message } from 'src/domain/aggregates/conversation/entities/Message';

/**
 * Application service responsible for managing conversation lifecycle
 * Handles retrieving, updating, and persisting conversation context
 */
export class ConversationService {
  constructor(
    private conversationRepository: ConversationRepository,
    private planRepository: TherapeuticPlanRepository,
    private contextLoader: ContextLoader,
  ) {}

  /**
   * Retrieves or creates conversation context for a user
   * @param userId - The identifier of the user
   * @returns ConversationContext - Complete context with history and plan
   * @throws ApplicationError if there's an issue retrieving context
   */
  async getConversationContext(userId: string): Promise<ConversationContext> {
    try {
      // Try to retrieve existing conversation
      const existingConversation = await this.conversationRepository.findLatestByUserId(userId);

      // If no existing conversation, create a new one
      if (!existingConversation) {
        const newConversation = await this.conversationRepository.createConversation({
          userId,
          state: ConversationState.INFO_GATHERING,
        });

        return {
          conversationId: newConversation.id,
          userId: newConversation.userId,
          currentState: newConversation.state,
          history: [],
          riskHistory: [],
          therapeuticPlan: undefined,
        };
      }

      // Load conversation history with appropriate depth
      const messageHistory = await this.conversationRepository.getMessageHistory(
        existingConversation.id,
        15, // Configurable history depth
      );

      // Load risk assessment history
      const riskHistory = await this.conversationRepository.getRiskHistory(
        existingConversation.id,
        10, // Configurable risk history depth
      );

      // Load therapeutic plan if one exists
      let therapeuticPlan: TherapeuticPlan | undefined;
      if (existingConversation.currentPlanId) {
        therapeuticPlan = await this.planRepository.findById(existingConversation.currentPlanId);
      }

      // Build context vector for semantic understanding
      const contextVector = this.contextLoader.buildContextVector(
        messageHistory,
        riskHistory,
        existingConversation.state,
      );

      // Update context vector if needed
      if (existingConversation.contextVector !== contextVector) {
        await this.conversationRepository.updateContextVector(
          existingConversation.id,
          contextVector,
        );
      }

      return {
        conversationId: existingConversation.id,
        userId: existingConversation.userId,
        currentState: existingConversation.state,
        history: messageHistory,
        riskHistory: riskHistory,
        therapeuticPlan: therapeuticPlan,
      };
    } catch (error) {
      throw new ApplicationError(
        'Failed to retrieve conversation context',
        `User ID: ${userId}; Original error: ${error}`,
        'HIGH',
      );
    }
  }

  /**
   * Creates a user message entity from text content
   * @param content - The message content
   * @param conversationId - The conversation ID
   * @param state - The current conversation state
   * @returns UserMessage - The created user message entity
   */
  createUserMessage(
    content: string,
    conversationId: string,
    state: ConversationState,
  ): UserMessage {
    return {
      id: this.generateId(),
      conversationId,
      content,
      role: 'user',
      context: state,
      createdAt: new Date(),
    };
  }

  /**
   * Persists updates to the conversation after processing
   * @param context - Original conversation context
   * @param userMessage - New user message
   * @param processingResult - Result of message processing pipeline
   * @returns ConversationContext - Updated context after persistence
   * @throws ApplicationError if there's an issue persisting the conversation
   */
  async persistConversationFlow(
    context: ConversationContext,
    userMessage: Message,
    processingResult: ProcessingResult,
  ): Promise<ConversationContext> {
    try {
      // Store the new user message
      await this.conversationRepository.saveMessage({
        conversationId: context.conversationId,
        content: userMessage.content,
        role: 'user',
        metadata: userMessage.metadata || {},
      });

      // Store the assistant response message
      const assistantMessage = await this.conversationRepository.saveMessage({
        conversationId: context.conversationId,
        content: processingResult.therapeuticResponse.content,
        role: 'assistant',
        metadata: {
          suggestedTechniques: processingResult.therapeuticResponse.suggestedTechniques || [],
          insights: processingResult.therapeuticResponse.insights || {},
        },
      });

      // Update conversation state if transition occurred
      if (processingResult.stateTransition.from !== processingResult.stateTransition.to) {
        await this.conversationRepository.updateState(
          context.conversationId,
          processingResult.stateTransition.to,
        );
      }

      // Record new risk assessment
      const riskAssessment = await this.conversationRepository.saveRiskAssessment({
        conversationId: context.conversationId,
        level: processingResult.riskAssessment.level,
        factors: processingResult.riskAssessment.factors,
        score: processingResult.riskAssessment.score,
      });

      // Update or create therapeutic plan if needed
      let updatedPlan = context.therapeuticPlan;
      if (processingResult.planUpdate.revisionRequired) {
        if (processingResult.planUpdate.newVersionId && context.therapeuticPlan) {
          // Update plan with new version
          updatedPlan = await this.planRepository.findById(context.therapeuticPlan.id);
        } else if (!context.therapeuticPlan) {
          // Create new plan if none exists
          updatedPlan = await this.planRepository.createPlan({
            userId: context.userId,
            initialContent: {
              goals: [],
              techniques: processingResult.therapeuticResponse.suggestedTechniques || [],
              insights: processingResult.therapeuticResponse.insights || {},
            },
          });

          // Associate plan with conversation
          await this.conversationRepository.updateTherapeuticPlan(
            context.conversationId,
            updatedPlan.id,
          );
        }
      }

      // Update context vector with new interaction data
      const updatedHistory = [
        ...context.history,
        userMessage,
        {
          ...assistantMessage,
          metadata: {
            suggestedTechniques: processingResult.therapeuticResponse.suggestedTechniques || [],
            insights: processingResult.therapeuticResponse.insights || {},
          },
        },
      ];

      const updatedRiskHistory = [...context.riskHistory, riskAssessment];

      const newContextVector = this.contextLoader.buildContextVector(
        updatedHistory,
        updatedRiskHistory,
        processingResult.stateTransition.to,
      );

      await this.conversationRepository.updateContextVector(
        context.conversationId,
        newContextVector,
      );

      // Return updated conversation context
      return {
        conversationId: context.conversationId,
        userId: context.userId,
        currentState: processingResult.stateTransition.to,
        history: updatedHistory,
        riskHistory: updatedRiskHistory,
        therapeuticPlan: updatedPlan,
      };
    } catch (error) {
      throw new ApplicationError(
        'Failed to persist conversation updates',
        `${{ conversationId: context.conversationId, originalError: error }}`,
        'LOW',
      );
    }
  }

  /**
   * Create a therapeutic response package for the client
   * @param processingResult - Result of message processing pipeline
   * @param context - Current conversation context
   * @returns SessionResponse - Response package for client
   */
  createResponsePackage(
    processingResult: ProcessingResult,
    context: ConversationContext,
  ): SessionResponse {
    return {
      message: processingResult.therapeuticResponse.content,
      metadata: {
        state: context.currentState,
        riskLevel: processingResult.riskAssessment.level as unknown as RiskLevel,
        suggestedTechniques: processingResult.therapeuticResponse.suggestedTechniques,
        progressMetrics: {
          score: processingResult.sessionProgress.score,
          insights: processingResult.sessionProgress.breakthroughs,
        },
      },
    };
  }

  /**
   * Generate a unique ID for entities
   * @returns string - A unique ID
   */
  private generateId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }
}
