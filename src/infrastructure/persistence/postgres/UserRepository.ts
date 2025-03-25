import { PrismaClient, User as PrismaUser } from '@prisma/client';
import { User } from '../../../domain/aggregates/user/entities/User';

export class UserRepository {
  constructor(private prisma: PrismaClient) {}

  async findById(userId: string): Promise<User | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    return user ? this.mapToDomainModel(user) : null;
  }

  async createUser(telegramId: string): Promise<User> {
    const user = await this.prisma.user.create({
      data: {
        id: telegramId,
        balance: 1, // Default balance for one free session
        telegramId,
      },
    });

    return this.mapToDomainModel(user);
  }

  async updateBalance(userId: string, newBalance: number): Promise<User> {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        balance: newBalance,
      },
    });

    return this.mapToDomainModel(user);
  }

  async incrementBalance(userId: string, amount: number): Promise<User> {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        balance: {
          increment: amount,
        },
      },
    });

    return this.mapToDomainModel(user);
  }

  async decrementBalance(userId: string, amount: number): Promise<User> {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        balance: {
          decrement: amount,
        },
      },
    });

    return this.mapToDomainModel(user);
  }

  private mapToDomainModel(prismaUser: PrismaUser): User {
    return new User(prismaUser.id, prismaUser.createdAt, prismaUser.updatedAt, prismaUser.balance);
  }
}
