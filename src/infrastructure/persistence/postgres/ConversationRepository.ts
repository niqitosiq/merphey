import {
  PrismaClient,
  ConversationState,
  RiskLevel,
  Message,
  Conversation as PrismaConversation,
} from '@prisma/client';
import {
  ConversationContext,
  Metadata,
} from '../../../domain/aggregates/conversation/entities/types';
import { RiskAssessment } from '../../../domain/aggregates/conversation/entities/RiskAssessment';
import { Conversation } from '../../../domain/aggregates/conversation/entities/Conversation';
import { ConversationFactory } from '../../../domain/aggregates/conversation/entities/ConversationFactory';
import { JsonValue } from '@prisma/client/runtime/library';

/**
 * Repository for conversation data persistence
 * Handles storage and retrieval of conversations, messages and risk assessments
 */
export class ConversationRepository {
  private prisma: PrismaClient;
  private conversationFactory: ConversationFactory;

  constructor() {
    this.prisma = new PrismaClient();
    this.conversationFactory = new ConversationFactory();
  }


  /**
   * Find the most recent conversation for a user
   * @param userId - The user's identifier
   * @returns The latest conversation or null if none exists
   */
  async findLatestByUserId(userId: string): Promise<PrismaConversation | null> {
    return this.prisma.conversation.findFirst({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
    });
  }

  /**
   * Get full conversation context by user ID
   * @param userId - The user identifier
   * @returns Complete conversation context or null
   */
  async getConversationByUserId(userId: string): Promise<ConversationContext | null> {
    const conversation = await this.prisma.conversation.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        messages: true,
        riskAssessments: true,
        therapeuticPlan: {
          include: {
            versions: true,
            currentVersion: true,
          },
        },
      },
    });

    if (!conversation) {
      return null;
    }

    return {
      conversationId: conversation.id,
      userId: conversation.userId,
      currentState: conversation.state,
      history: conversation.messages.map((msg) => ({
        ...msg,
        metadata: msg.metadata ? (JSON.parse(msg.metadata as string) as Metadata) : {},
      })),
      riskHistory: conversation.riskAssessments.map(
        (assessment) =>
          new RiskAssessment(
            assessment.id,
            assessment.level,
            assessment.factors,
            assessment.score,
            assessment.createdAt,
          ),
      ),
      therapeuticPlan: conversation.therapeuticPlan
        ? this.mapToTherapeuticPlan(conversation.therapeuticPlan)
        : undefined,
    };
  }

  /**
   * Create a new conversation for a user
   * @param data - The conversation data
   * @returns The created conversation
   */
  async createConversation(data: {
    userId: string;
    state: ConversationState;
  }): Promise<PrismaConversation> {
    const conversation = this.conversationFactory.createConversation({
      userId: data.userId,
      initialState: data.state,
    });

    return this.prisma.conversation.create({
      data: {
        id: conversation.id,
        userId: conversation.userId,
        state: conversation.state,
      },
    });
  }

  /**
   * Get message history for a conversation
   * @param conversationId - The conversation identifier
   * @param limit - Maximum number of messages to retrieve
   * @returns Array of messages
   */
  async getMessageHistory(conversationId: string, limit: number = 15): Promise<Message[]> {
    return this.prisma.message
      .findMany({
        where: { conversationId },
        orderBy: { createdAt: 'desc' },
        take: limit,
      })
      .then((messages) => messages.reverse()); // Reverse to get chronological order
  }

  /**
   * Get risk assessment history for a conversation
   * @param conversationId - The conversation identifier
   * @param limit - Maximum number of risk assessments to retrieve
   * @returns Array of risk assessments
   */
  async getRiskHistory(conversationId: string, limit: number = 10): Promise<RiskAssessment[]> {
    const riskRecords = await this.prisma.riskAssessment.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    // Map Prisma models to domain models
    return riskRecords.map(
      (record) =>
        new RiskAssessment(
          record.id,
          record.level,
          record.factors,
          record.score,
          record.createdAt,
        ),
    );
  }

  /**
   * Save a new message to the conversation
   * @param data - The message data
   * @returns The created message
   */
  async saveMessage(data: {
    conversationId: string;
    content: string;
    role: string;
    metadata: Metadata;
  }): Promise<Message> {
    return this.prisma.message.create({
      data: {
        conversationId: data.conversationId,
        content: data.content,
        role: data.role,
        metadata: data.metadata,
      },
    });
  }

  /**
   * Add a pre-created message to a conversation
   * @param message - The message to add
   * @returns The ID of the created message
   */
  async addMessage(message: Message): Promise<string> {
    const created = await this.prisma.message.create({
      data: {
        id: message.id,
        content: message.content,
        role: message.role,
        conversationId: message.conversationId,
        metadata: message.metadata as any, // Prisma will handle JSON serialization
      },
    });

    return created.id;
  }

  /**
   * Save a new risk assessment for a conversation
   * @param data - The risk assessment data
   * @returns The created risk assessment
   */
  async saveRiskAssessment(data: {
    conversationId: string;
    level: RiskLevel;
    factors: string[];
    score: number;
  }): Promise<RiskAssessment> {
    const record = await this.prisma.riskAssessment.create({
      data: {
        conversationId: data.conversationId,
        level: data.level,
        factors: data.factors,
        score: data.score,
      },
    });

    // Return domain entity
    return new RiskAssessment(record.id, data.level, data.factors, data.score, record.createdAt);
  }

  /**
   * Add a pre-created risk assessment to a conversation
   * @param conversationId - The conversation identifier
   * @param assessment - The risk assessment to add
   */
  async addRiskAssessment(conversationId: string, assessment: RiskAssessment): Promise<void> {
    await this.prisma.riskAssessment.create({
      data: {
        id: assessment.id,
        level: assessment.level,
        factors: assessment.factors,
        score: assessment.score,
        conversationId,
      },
    });
  }

  /**
   * Update the conversation state
   * @param conversationId - The conversation identifier
   * @param newState - The new state
   * @returns The updated conversation
   */
  async updateState(
    conversationId: string,
    newState: ConversationState,
  ): Promise<PrismaConversation> {
    return this.prisma.conversation.update({
      where: { id: conversationId },
      data: { state: newState, updatedAt: new Date() },
    });
  }

  /**
   * Update the conversation's context vector
   * @param conversationId - The conversation identifier
   * @param contextVector - The new context vector
   * @returns The updated conversation
   */
  async updateContextVector(
    conversationId: string,
    contextVector: string,
  ): Promise<PrismaConversation> {
    return this.prisma.conversation.update({
      where: { id: conversationId },
      data: { contextVector },
    });
  }

  /**
   * Update the therapeutic plan associated with a conversation
   * @param conversationId - The conversation identifier
   * @param planId - The therapeutic plan identifier
   * @returns The updated conversation
   */
  async updateTherapeuticPlan(conversationId: string, planId: string): Promise<PrismaConversation> {
    return this.prisma.conversation.update({
      where: { id: conversationId },
      data: { currentPlanId: planId },
    });
  }

  /**
   * Get a conversation by its ID
   * @param conversationId - The conversation identifier
   * @returns The conversation or null if not found
   */
  async getById(conversationId: string): Promise<Conversation | null> {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        messages: true,
        riskAssessments: true,
        therapeuticPlan: {
          include: {
            versions: true,
            currentVersion: true,
          },
        },
      },
    });

    if (!conversation) {
      return null;
    }

    return this.conversationFactory.reconstitute({
      ...conversation,
      messages: conversation.messages.map((msg) => ({
        ...msg,
        metadata: msg.metadata ? JSON.parse(msg.metadata as string) : null,
      })),
      riskAssessments: conversation.riskAssessments.map(
        (assessment) =>
          new RiskAssessment(
            assessment.id,
            assessment.level,
            assessment.factors,
            assessment.score,
            assessment.createdAt,
          ),
      ),
      therapeuticPlan: conversation.therapeuticPlan
        ? this.mapToTherapeuticPlan(conversation.therapeuticPlan)
        : null,
    });
  }

  /**
   * Maps a Prisma therapeutic plan to a domain model
   * @param prismaTherapeuticPlan - The Prisma therapeutic plan
   * @returns The domain model therapeutic plan
   */
  private mapToTherapeuticPlan(prismaTherapeuticPlan: any) {
    // TODO: Implement mapping from Prisma TherapeuticPlan to domain TherapeuticPlan
    // This needs to be implemented based on your TherapeuticPlan domain entity structure
    return prismaTherapeuticPlan;
  }
}
