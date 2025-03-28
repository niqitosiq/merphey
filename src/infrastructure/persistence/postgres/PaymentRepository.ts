import { PrismaClient, Payment as PrismaPayment, PaymentStatus } from '@prisma/client';
import { Payment } from '../../../domain/aggregates/user/entities/Payment';
import { PaymentRepository as PaymentRepositoryPort } from '../../../domain/ports/payment.repository.port';

export class PaymentRepository implements PaymentRepositoryPort {
  constructor(private prisma: PrismaClient) {}

  async create(
    userId: string,
    amount: number,
    provider: string = 'telegram',
    metadata?: Record<string, any>,
  ): Promise<Payment> {
    const payment = await this.prisma.payment.create({
      data: {
        userId,
        amount,
        provider,
        status: PaymentStatus.PENDING,
        metadata: metadata ? JSON.stringify(metadata) : undefined,
      },
    });

    return this.mapToDomainModel(payment);
  }

  async findById(paymentId: string): Promise<Payment | null> {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
    });

    return payment ? this.mapToDomainModel(payment) : null;
  }

  async findByUserId(userId: string): Promise<Payment[]> {
    const payments = await this.prisma.payment.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    return payments.map((payment) => this.mapToDomainModel(payment));
  }

  async updateStatus(paymentId: string, status: PaymentStatus): Promise<Payment> {
    const payment = await this.prisma.payment.update({
      where: { id: paymentId },
      data: {
        status: status as PaymentStatus,
      },
    });

    return this.mapToDomainModel(payment);
  }

  private mapToDomainModel(prismaPayment: PrismaPayment): Payment {
    return new Payment(
      prismaPayment.id,
      prismaPayment.userId,
      prismaPayment.amount,
      prismaPayment.provider,
      prismaPayment.status,
      prismaPayment.metadata ? JSON.parse(prismaPayment.metadata as string) : null,
      prismaPayment.createdAt,
      prismaPayment.updatedAt,
    );
  }
}
