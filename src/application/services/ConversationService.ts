import {
  ConversationContext,
  UserMessage,
  ProcessingResult,
  SessionResponse,
  Metadata,
} from '../../domain/aggregates/conversation/entities/types';
import { ConversationRepository } from '../../infrastructure/persistence/postgres/ConversationRepository';
import { TherapeuticPlanRepository } from '../../infrastructure/persistence/postgres/PlanRepository';
import { ConversationState, RiskLevel } from '@prisma/client';
import { ApplicationError } from '../../shared/errors/application-errors';
import { Message } from '@prisma/client';
import { UserRepository } from 'src/infrastructure/persistence/postgres/UserRepository';
import { PlanEvolutionService } from 'src/domain/services/analysis/PlanEvolutionService';
import { User } from 'src/domain/aggregates/user/entities/User';

/**
 * Application service responsible for managing conversation lifecycle
 * Handles retrieving, updating, and persisting conversation context
 */
export class ConversationService {
  constructor(
    private conversationRepository: ConversationRepository,
    private planRepository: TherapeuticPlanRepository,
    private userRepository: UserRepository,
    private planEvolutionService: PlanEvolutionService,
  ) {}

  generateId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  async getUserById(userId: string): Promise<User | null> {
    try {
      const user = await this.userRepository.findById(userId);
      return user;
    } catch (error) {
      throw new ApplicationError(
        'Failed to retrieve user',
        `User ID: ${userId}; Original error: ${error}`,
        'HIGH',
      );
    }
  }

  async createUser(telegramId: string): Promise<User> {
    try {
      const newUser = await this.userRepository.createUser(telegramId);
      return newUser;
    } catch (error) {
      throw new ApplicationError('Failed to create user', `Original error: ${error}`, 'HIGH');
    }
  }

  async initializeConversationContext(userId: string): Promise<ConversationContext> {
    try {
      // let user = await this.userRepository.findById(userId);

      const newConversation = await this.conversationRepository.createConversation({
        userId,
        state: ConversationState.INFO_GATHERING,
      });

      const therapeuticPlan = await this.planRepository.createPlan({
        userId,
        initialContent: this.planEvolutionService.generateInitialPlan(),
      });

      await this.conversationRepository.updateTherapeuticPlan(
        newConversation.id,
        therapeuticPlan.id,
      );

      return {
        conversationId: newConversation.id,
        userId: newConversation.userId,
        currentState: newConversation.state,
        history: [],
        riskHistory: [],
        therapeuticPlan,
      };
    } catch (error) {
      throw new ApplicationError(
        'Failed to initialize conversation context',
        `User ID: ${userId}; Original error: ${error}`,
        'HIGH',
      );
    }
  }

  /**
   * Retrieves or creates conversation context for a user
   * @param userId - The identifier of the user
   * @returns ConversationContext - Complete context with history and plan
   * @throws ApplicationError if there's an issue retrieving context
   */
  async getConversationContext(userId: string): Promise<ConversationContext | null> {
    try {
      const existingConversation = await this.conversationRepository.findLatestByUserId(userId);

      if (!existingConversation) {
        const newConversation = await this.initializeConversationContext(userId);
        return newConversation;
      }

      const messageHistory = (
        await this.conversationRepository.getMessageHistory(existingConversation.id, 15)
      ).map((msg) => ({
        ...msg,
        metadata: msg.metadata as Metadata | undefined,
        context: existingConversation.state,
      })) as UserMessage[];

      const riskHistory = await this.conversationRepository.getRiskHistory(
        existingConversation.id,
        10,
      );

      if (!existingConversation.currentPlanId) {
        throw new ApplicationError(
          'No therapeutic plan found for conversation',
          `Conversation ID: ${existingConversation.id}`,
          'MEDIUM',
        );
      }

      let therapeuticPlan = await this.planRepository.findById(existingConversation.currentPlanId);

      if (!therapeuticPlan) {
        throw new ApplicationError(
          'Therapeutic plan not found',
          `Plan ID: ${existingConversation.currentPlanId}`,
          'MEDIUM',
        );
      }

      // const contextVector = this.contextLoader.buildContextVector(
      //   messageHistory,
      //   riskHistory,
      //   existingConversation.state,
      // );

      // if (existingConversation.contextVector !== contextVector) {
      //   await this.conversationRepository.updateContextVector(
      //     existingConversation.id,
      //     contextVector,
      //   );
      // }

      return {
        conversationId: existingConversation.id,
        userId: existingConversation.userId,
        currentState: existingConversation.state,
        history: messageHistory,
        riskHistory,
        therapeuticPlan,
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
      const savedUserMessage = await this.conversationRepository.saveMessage({
        conversationId: context.conversationId,
        content: userMessage.content,
        role: 'user',
        metadata: userMessage.metadata as Metadata,
      });

      const assistantMessages = await Promise.all(
        processingResult.therapeuticResponse.content.map(async (message: string) => {
          return this.conversationRepository.saveMessage({
            conversationId: context.conversationId,
            content: message,
            role: 'assistant',
            metadata: {
              suggestedTechniques: processingResult.therapeuticResponse.suggestedTechniques || [],
              insights: processingResult.therapeuticResponse.insights || {},
            },
          });
        }),
      );

      if (processingResult.stateTransition.from !== processingResult.stateTransition.to) {
        await this.conversationRepository.updateState(
          context.conversationId,
          processingResult.stateTransition.to,
        );
      }

      const riskAssessment = await this.conversationRepository.saveRiskAssessment({
        conversationId: context.conversationId,
        level: processingResult.riskAssessment.level,
        factors: processingResult.riskAssessment.factors,
        score: processingResult.riskAssessment.score,
      });

      console.log(JSON.stringify(riskAssessment), 'riskAssessment');

      if (!!processingResult.updatedVersion) {
        const currentPlan = context.therapeuticPlan;
        const updatedPlanVersion = processingResult.updatedVersion;

        if (updatedPlanVersion) {
          await this.planRepository.createPlanVersion(
            currentPlan.id,
            currentPlan.currentVersionId,
            JSON.stringify(updatedPlanVersion.content),
            updatedPlanVersion.validationScore || 1,
          );
        }

        console.log(JSON.stringify(updatedPlanVersion), 'updatedPlanVersion');
      }

      // Convert messages to UserMessage type with proper metadata
      const convertToUserMessage = (msg: Message): UserMessage => ({
        id: msg.id,
        conversationId: msg.conversationId,
        content: msg.content,
        role: msg.role,
        metadata: msg.metadata as Metadata,
        context: processingResult.stateTransition.to,
        createdAt: msg.createdAt,
      });

      const updatedHistory = [
        ...context.history,
        convertToUserMessage(savedUserMessage),
        ...assistantMessages.map(convertToUserMessage),
      ];

      const updatedRiskHistory = [...context.riskHistory, riskAssessment];

      return {
        conversationId: context.conversationId,
        userId: context.userId,
        currentState: processingResult.stateTransition.to,
        history: updatedHistory,
        riskHistory: updatedRiskHistory,
        therapeuticPlan: context.therapeuticPlan,
      };
    } catch (error: any) {
      throw new Error(
        `Failed to persist conversation flow: ${error.message}; User ID: ${context.userId}`,
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
      messages: processingResult.therapeuticResponse.content,
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
   * Resets the conversation state for a user by creating a new conversation
   * @param userId - The user identifier
   * @returns Promise<void>
   */
  async resetConversationState(userId: string): Promise<void> {
    try {
      // Create a new conversation context which will also create a new therapeutic plan
      await this.initializeConversationContext(userId);
    } catch (error) {
      throw new ApplicationError(
        'Failed to reset conversation state',
        `User ID: ${userId}; Original error: ${error}`,
        'HIGH',
      );
    }
  }
}
