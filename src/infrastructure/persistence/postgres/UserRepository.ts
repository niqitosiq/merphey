import { PrismaClient, User as PrismaUser } from '@prisma/client';
import { User } from '../../../domain/aggregates/user/entities/User';

export class UserRepository {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = new PrismaClient();
  }

  /**
   * Find a user by their ID
   */
  async findById(id: string): Promise<User | null> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        conversations: {
          include: {
            messages: true,
            riskAssessments: true,
          },
        },
        therapeuticPlans: {
          include: {
            versions: true,
            currentVersion: true,
          },
        },
      },
    });

    if (!user) {
      return null;
    }

    return this.mapToDomainUser(user);
  }

  /**
   * Create a new user
   */
  async createUser(userId: string): Promise<User> {
    const user = await this.prisma.user.create({
      data: {
        id: userId,
      },
      include: {
        conversations: true,
        therapeuticPlans: true,
      },
    });

    return this.mapToDomainUser(user);
  }

  /**
   * Get users with active conversations within the specified time window
   */
  async getActiveUsers(withinHours: number = 24): Promise<User[]> {
    const dateThreshold = new Date(Date.now() - withinHours * 60 * 60 * 1000);

    const users = await this.prisma.user.findMany({
      where: {
        conversations: {
          some: {
            updatedAt: {
              gte: dateThreshold,
            },
          },
        },
      },
      include: {
        conversations: {
          include: {
            messages: true,
            riskAssessments: true,
          },
        },
        therapeuticPlans: {
          include: {
            versions: true,
            currentVersion: true,
          },
        },
      },
    });

    return users.map((user) => this.mapToDomainUser(user));
  }

  /**
   * Map Prisma user model to domain user entity
   */
  private mapToDomainUser(
    prismaUser: PrismaUser & {
      conversations?: any[];
      therapeuticPlans?: any[];
    },
  ): User {
    return new User(
      prismaUser.id,
      prismaUser.createdAt,
      prismaUser.updatedAt,
      prismaUser.conversations || [],
      prismaUser.therapeuticPlans || [],
    );
  }
}
