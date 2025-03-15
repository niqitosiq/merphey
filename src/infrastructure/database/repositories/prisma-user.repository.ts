import { User } from '../../../domain/user-interaction/entities/user.entity';
import {
  MessageHistory,
  TemporalMessage,
} from '../../../domain/user-interaction/value-objects/message-history.value-object';
import { ConversationState } from '../../../domain/user-interaction/value-objects/conversation-state.value-object';
import { RiskLevel } from '../../../domain/risk-management/value-objects/risk-level.value-object';
import { prisma } from '../prisma-client';
import {
  User as PrismaUser,
  MessageHistory as PrismaMessageHistory,
  Message as PrismaMessage,
  EmotionVector as PrismaEmotionVector,
  Prisma,
  SenderType,
  RiskLevel as PrismaRiskLevel,
  ConversationState as PrismaConversationState,
} from '@prisma/client';

type UserWithHistory = PrismaUser & {
  messageHistory:
    | (PrismaMessageHistory & {
        messages: PrismaMessage[];
        sentimentTrends: PrismaEmotionVector[];
      })
    | null;
};

export interface IUserRepository {
  findById(id: string): Promise<User | null>;
  save(user: User): Promise<User>;
  update(id: string, updates: Partial<User>): Promise<User>;
  delete(id: string): Promise<boolean>;

  // Message history specific operations
  getMessageHistory(userId: string): Promise<MessageHistory>;
  addMessage(userId: string, message: TemporalMessage): Promise<void>;
  updateMessageHistory(userId: string, history: MessageHistory): Promise<void>;

  // Specialized queries
  findByRiskLevel(level: RiskLevel): Promise<User[]>;
  findByConversationState(state: ConversationState): Promise<User[]>;
  findRecentlyActive(hours: number): Promise<User[]>;
}

export class PrismaUserRepository implements IUserRepository {
  async findById(id: string): Promise<User | null> {
    const user = await prisma.user.findUnique({
      where: { id },
      include: {
        messageHistory: {
          include: {
            messages: true,
            sentimentTrends: true,
          },
        },
      },
    });

    if (!user) return null;

    return this.mapToDomainUser(user as UserWithHistory);
  }

  async save(user: Omit<User, 'messageHistory'>): Promise<User> {
    const prismaUserData: Prisma.UserCreateInput = {
      id: user.id,
      riskProfile: user.riskProfile as PrismaRiskLevel,
      conversationState: user.conversationState as PrismaConversationState,
      planVersion: user.planVersion,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };

    const saved = await prisma.user.create({
      data: prismaUserData,
      include: {
        messageHistory: {
          include: {
            messages: true,
            sentimentTrends: true,
          },
        },
      },
    });

    return this.mapToDomainUser(saved as UserWithHistory);
  }

  async update(id: string, updates: Partial<Omit<User, 'messageHistory'>>): Promise<User> {
    const prismaUpdateData: Prisma.UserUpdateInput = {
      riskProfile: updates.riskProfile as PrismaRiskLevel | null | undefined,
      conversationState: updates.conversationState as PrismaConversationState | null | undefined,
      planVersion: updates.planVersion,
      updatedAt: new Date(),
    };

    const updated = await prisma.user.update({
      where: { id },
      data: prismaUpdateData,
      include: {
        messageHistory: {
          include: {
            messages: true,
            sentimentTrends: true,
          },
        },
      },
    });

    return this.mapToDomainUser(updated as UserWithHistory);
  }

  async delete(id: string): Promise<boolean> {
    try {
      await prisma.user.delete({
        where: { id },
      });
      return true;
    } catch {
      return false;
    }
  }

  async getMessageHistory(userId: string): Promise<MessageHistory> {
    const history = await prisma.messageHistory.findUnique({
      where: { userId },
      include: {
        messages: true,
        sentimentTrends: true,
      },
    });

    if (!history) {
      return {
        id: crypto.randomUUID(),
        userId,
        messages: [],
        sentimentTrends: [],
        contextKeywords: '[]',
        lastAnalyzedAt: null,
      };
    }

    return this.mapToDomainMessageHistory(history);
  }

  async addMessage(userId: string, message: MessageHistory): Promise<void> {
    const { content, timestamp, sender, metadata } = message;

    const messageData: Prisma.MessageCreateInput = {
      content,
      timestamp,
      sender: sender as SenderType,
      metadata: metadata,
      history: {
        connect: { userId },
      },
    };

    await prisma.message.create({
      data: messageData,
    });
  }

  async updateMessageHistory(userId: string, history: MessageHistory): Promise<void> {
    await prisma.messageHistory.upsert({
      where: { userId },
      create: {
        id: history.id || undefined,
        userId,
        contextKeywords: history.contextKeywords,
        lastAnalyzedAt: history.lastAnalyzedAt,
      },
      update: {
        contextKeywords: history.contextKeywords,
        lastAnalyzedAt: history.lastAnalyzedAt,
      },
    });
  }

  async findByRiskLevel(level: RiskLevel): Promise<User[]> {
    const users = await prisma.user.findMany({
      where: {
        riskProfile: level as PrismaRiskLevel,
      },
      include: {
        messageHistory: {
          include: {
            messages: true,
            sentimentTrends: true,
          },
        },
      },
    });

    return users.map((user) => this.mapToDomainUser(user as UserWithHistory));
  }

  async findByConversationState(state: ConversationState): Promise<User[]> {
    const users = await prisma.user.findMany({
      where: {
        conversationState: state as PrismaConversationState,
      },
      include: {
        messageHistory: {
          include: {
            messages: true,
            sentimentTrends: true,
          },
        },
      },
    });

    return users.map((user) => this.mapToDomainUser(user as UserWithHistory));
  }

  async findRecentlyActive(hours: number): Promise<User[]> {
    const cutoffDate = new Date();
    cutoffDate.setHours(cutoffDate.getHours() - hours);

    const users = await prisma.user.findMany({
      where: {
        updatedAt: {
          gte: cutoffDate,
        },
      },
      orderBy: {
        updatedAt: 'desc',
      },
      include: {
        messageHistory: {
          include: {
            messages: true,
            sentimentTrends: true,
          },
        },
      },
    });

    return users.map((user) => this.mapToDomainUser(user as UserWithHistory));
  }

  private mapToDomainUser(prismaUser: UserWithHistory): User {
    return {
      id: prismaUser.id,
      riskProfile: prismaUser.riskProfile as RiskLevel,
      conversationState: prismaUser.conversationState as ConversationState,
      planVersion: prismaUser.planVersion,
      createdAt: prismaUser.createdAt,
      updatedAt: prismaUser.updatedAt,
      messageHistory: prismaUser.messageHistory
        ? this.mapToDomainMessageHistory(prismaUser.messageHistory)
        : undefined,
    };
  }

  private mapToDomainMessageHistory(
    prismaHistory: PrismaMessageHistory & {
      messages: PrismaMessage[];
      sentimentTrends: PrismaEmotionVector[];
    },
  ): MessageHistory {
    return {
      id: prismaHistory.id,
      userId: prismaHistory.userId,
      messages: prismaHistory.messages,
      sentimentTrends: prismaHistory.sentimentTrends,
      contextKeywords: prismaHistory.contextKeywords,
      lastAnalyzedAt: prismaHistory.lastAnalyzedAt,
    };
  }
}
