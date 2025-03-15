/**
 * UserRepository - Handles persistence operations for User entities and their message histories
 */

import { User } from '../entities/user.entity';
import { MessageHistory } from '../value-objects/message-history.value-object';
import { PrismaUserRepository } from '@infrastructure/database/repositories/prisma-user.repository';

export class UserRepository extends PrismaUserRepository {
  protected validateUser(user: User): void {
    if (!user.id) {
      throw new Error('User must have an ID');
    }

    if (!user.createdAt) {
      throw new Error('User must have a creation date');
    }

    if (!user.updatedAt) {
      throw new Error('User must have an update date');
    }
  }

  protected createDefaultMessageHistory(): MessageHistory {
    return {
      id: null,
      userId: null,
      messages: [],
      sentimentTrends: [],
      contextKeywords: '[]',
      lastAnalyzedAt: new Date(),
    };
  }
}
