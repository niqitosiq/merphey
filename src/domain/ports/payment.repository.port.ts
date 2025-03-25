import { Payment } from '../aggregates/user/entities/Payment';
import { PaymentStatus } from '../shared/enums';

export interface PaymentRepository {
  create(
    userId: string,
    amount: number,
    provider: string,
    metadata?: Record<string, any>,
  ): Promise<Payment>;
  findById(paymentId: string): Promise<Payment | null>;
  findByUserId(userId: string): Promise<Payment[]>;
  updateStatus(paymentId: string, status: PaymentStatus): Promise<Payment>;
}
