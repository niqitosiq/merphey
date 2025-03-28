import { PaymentRepository } from '../../ports/payment.repository.port';
import { Payment } from '../../aggregates/user/entities/Payment';
import { User } from '../../aggregates/user/entities/User';
import { EventBus } from '../../../shared/events/EventBus';
import { EventTypes } from '../../../shared/events/EventTypes';
import { PaymentStatus } from '@prisma/client';

export class PaymentService {
  constructor(
    private paymentRepository: PaymentRepository,
    private eventBus: EventBus,
  ) {}

  async createPayment(
    userId: string,
    amount: number,
    provider: string = 'telegram',
    metadata?: Record<string, any>,
  ): Promise<Payment> {
    const payment = await this.paymentRepository.create(userId, amount, provider, metadata);

    this.eventBus.publish(EventTypes.PAYMENT_CREATED, {
      paymentId: payment.id,
      userId,
      amount,
      provider,
    });

    return payment;
  }

  async completePayment(paymentId: string, user: User): Promise<Payment> {
    const payment = await this.paymentRepository.findById(paymentId);

    if (!payment) {
      throw new Error(`Payment with ID ${paymentId} not found`);
    }

    if (payment.status !== PaymentStatus.PENDING) {
      throw new Error('Cannot complete a payment that is not pending');
    }

    // Update payment status to completed
    const updatedPayment = await this.paymentRepository.updateStatus(
      paymentId,
      PaymentStatus.COMPLETED,
    );

    // Add balance to user account
    user.increaseBalance(payment.amount);

    // Emit payment completed event
    this.eventBus.publish(EventTypes.PAYMENT_COMPLETED, {
      paymentId: updatedPayment.id,
      userId: updatedPayment.userId,
      amount: updatedPayment.amount,
    });

    return updatedPayment;
  }

  async failPayment(paymentId: string): Promise<Payment> {
    const payment = await this.paymentRepository.findById(paymentId);

    if (!payment) {
      throw new Error(`Payment with ID ${paymentId} not found`);
    }

    if (payment.status !== PaymentStatus.PENDING) {
      throw new Error('Cannot fail a payment that is not pending');
    }

    // Update payment status to failed
    const updatedPayment = await this.paymentRepository.updateStatus(
      paymentId,
      PaymentStatus.FAILED,
    );

    // Emit payment failed event
    this.eventBus.publish(EventTypes.PAYMENT_FAILED, {
      paymentId: updatedPayment.id,
      userId: updatedPayment.userId,
      amount: updatedPayment.amount,
    });

    return updatedPayment;
  }

  async getUserPaymentHistory(userId: string): Promise<Payment[]> {
    return this.paymentRepository.findByUserId(userId);
  }
}
