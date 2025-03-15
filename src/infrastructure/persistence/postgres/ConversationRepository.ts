import { PrismaClient, ConversationState, RiskLevel as PrismaRiskLevel } from '@prisma/client';
import {
  ConversationContext,
  UserMessage,
} from '../../../domain/aggregates/conversation/entities/types';
import { ConversationFactory } from '../../../domain/aggregates/conversation/entities/ConversationFactory';
import { RiskAssessment } from '../../../domain/aggregates/conversation/entities/RiskAssessment';
import { Conversation } from '../../../domain/aggregates/conversation/entities/Conversation';
import { RiskLevel } from '../../../domain/shared/enums';

export class ConversationRepository {
  private prisma: PrismaClient;
  private conversationFactory: ConversationFactory;

  constructor() {
    this.prisma = new PrismaClient();
    this.conversationFactory = new ConversationFactory();
  }

  private mapPrismaRiskLevel(level: PrismaRiskLevel): RiskLevel {
    return RiskLevel[level as keyof typeof RiskLevel];
  }

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
        metadata: msg.metadata ? JSON.parse(msg.metadata as string) : null,
      })) as UserMessage[],
      riskHistory: conversation.riskAssessments.map(
        (assessment) =>
          new RiskAssessment(
            assessment.id,
            this.mapPrismaRiskLevel(assessment.level),
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

  async createConversation(
    userId: string,
    initialState: ConversationState,
  ): Promise<ConversationContext> {
    const conversation = this.conversationFactory.createConversation({
      userId,
      initialState,
    });

    const created = await this.prisma.conversation.create({
      data: {
        id: conversation.id,
        userId: conversation.userId,
        state: conversation.state,
        contextVector: null,
      },
      include: {
        messages: true,
        riskAssessments: true,
        therapeuticPlan: true,
      },
    });

    return {
      conversationId: created.id,
      userId: created.userId,
      currentState: created.state,
      history: [],
      riskHistory: [],
    };
  }

  async addMessage(message: UserMessage): Promise<string> {
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

  async updateState(conversationId: string, newState: ConversationState): Promise<void> {
    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { state: newState },
    });
  }

  async addRiskAssessment(conversationId: string, assessment: RiskAssessment): Promise<void> {
    await this.prisma.riskAssessment.create({
      data: {
        id: assessment.id,
        level: PrismaRiskLevel[assessment.level as keyof typeof PrismaRiskLevel],
        factors: assessment.factors,
        score: assessment.score,
        conversationId,
      },
    });
  }

  async updateContextVector(conversationId: string, vector: string): Promise<void> {
    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { contextVector: vector },
    });
  }

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
            this.mapPrismaRiskLevel(assessment.level),
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

  private mapToTherapeuticPlan(prismaTherapeuticPlan: any) {
    // TODO: Implement mapping from Prisma TherapeuticPlan to domain TherapeuticPlan
    // This needs to be implemented based on your TherapeuticPlan domain entity structure
    return prismaTherapeuticPlan;
  }
}
