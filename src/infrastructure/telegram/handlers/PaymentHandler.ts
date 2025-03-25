import TelegramBot from 'node-telegram-bot-api';
import { PaymentService } from '../../../domain/services/payment/PaymentService';
import { UserRepository } from '../../persistence/postgres/UserRepository';
import { EventBus } from '../../../shared/events/EventBus';
import { EventTypes } from '../../../shared/events/EventTypes';

export class PaymentHandler {
  private readonly MAX_CREDITS_PER_TRANSACTION = 1;
  private readonly STARS_PER_CREDIT = 150; // 150 Telegram Stars = 1 credit

  constructor(
    private bot: TelegramBot,
    private paymentService: PaymentService,
    private userRepository: UserRepository,
    private eventBus: EventBus,
  ) {}

  async handlePreCheckoutQuery(query: TelegramBot.PreCheckoutQuery): Promise<void> {
    await this.bot.answerPreCheckoutQuery(query.id, true);
  }

  async handleSuccessfulPayment(msg: TelegramBot.Message): Promise<void> {
    if (!msg.successful_payment) {
      return;
    }

    const userId = msg.from?.id.toString();

    if (!userId) {
      return;
    }

    const payment = msg.successful_payment;
    const starsAmount = payment.total_amount; // Amount in stars (no need to divide by 100)
    const creditsToAdd = Math.floor(starsAmount / this.STARS_PER_CREDIT);

    if (creditsToAdd < 1) {
      await this.handlePaymentFailure(msg, new Error('Insufficient stars amount'));
      return;
    }

    try {
      const user = await this.userRepository.findById(userId);

      if (!user) {
        console.error('User not found for payment:', userId);
        return;
      }

      // Create a payment record
      const paymentRecord = await this.paymentService.createPayment(
        userId,
        creditsToAdd,
        'telegram_stars',
        {
          telegramPaymentId: payment.telegram_payment_charge_id,
          starsAmount: starsAmount,
          currency: payment.currency,
        },
      );

      // Complete the payment and add credits to user balance
      await this.paymentService.completePayment(paymentRecord.id, user);

      // Update user balance in database
      await this.userRepository.updateBalance(userId, user.balance);

      await this.bot.sendMessage(
        msg.chat.id,
        `✅ Оплата успешна! ${creditsToAdd} ${this.getCreditWord(creditsToAdd)} добавлено на ваш баланс.\n\n` +
          `Ваш текущий баланс: ${user.balance} ${this.getCreditWord(user.balance)}.\n\n` +
          `Теперь вы можете начать еще ${user.balance} ${this.getSessionWord(user.balance)} используя /session.`,
      );

      this.eventBus.publish(EventTypes.PAYMENT_COMPLETED, {
        userId,
        paymentId: paymentRecord.id,
        amount: creditsToAdd,
        starsUsed: starsAmount,
        totalBalance: user.balance,
      });
    } catch (error) {
      console.error('Error processing payment:', error);
      await this.handlePaymentFailure(msg, error);
    }
  }

  async handlePaymentFailure(msg: TelegramBot.Message, error: any): Promise<void> {
    const userId = msg.from?.id.toString();

    if (!userId) {
      return;
    }

    await this.bot.sendMessage(
      msg.chat.id,
      'К сожалению, платеж не удался. Пожалуйста, попробуйте позже или выберите другой способ оплаты.',
    );

    this.eventBus.publish(EventTypes.PAYMENT_FAILED, {
      userId,
      error: error instanceof Error ? error.message : 'Payment processing failed',
      metadata: {
        chatId: msg.chat.id,
        timestamp: new Date(),
      },
    });
  }

  async createPaymentInvoice(chatId: number, userId: string): Promise<void> {
    const user = await this.userRepository.findById(userId);

    if (!user) {
      await this.bot.sendMessage(chatId, 'Пожалуйста, используйте /start чтобы создать аккаунт.');
      return;
    }

    try {
      // Create invoice for adding credits
      await this.bot.sendInvoice(
        chatId,
        'Добавить Кредиты', // title
        'Приобретите кредиты для продолжения общения с помощником. 150 звёзд = 1 кредит', // description
        `add_credits_${Date.now()}`, // payload
        process.env.TELEGRAM_PAYMENT_TOKEN || '', // provider_token
        'XTR', // Using Telegram Stars as currency
        [{ label: '1 Кредит', amount: this.STARS_PER_CREDIT }],
      );

      await this.bot.sendMessage(
        chatId,
        `💰 Ваш текущий баланс: ${user.balance} ${this.getCreditWord(user.balance)}.\n\n` +
          `Каждый сеанс длится 30 минут и стоит 1 кредит.\n` +
          `1 кредит = 150 звёзд Telegram.\n\n` +
          `Вы можете добавить больше кредитов через Telegram Stars, нажав на счет выше.`,
      );
    } catch (error) {
      console.error('Error creating payment invoice:', error);
      await this.bot.sendMessage(
        chatId,
        'Произошла ошибка при создании счета. Пожалуйста, попробуйте позже.',
      );
    }
  }

  async handlePaymentConfiguration(chatId: number): Promise<void> {
    try {
      const prices = [];
      for (let i = 1; i <= this.MAX_CREDITS_PER_TRANSACTION; i++) {
        prices.push({
          label: `${i} ${this.getCreditWord(i)}`,
          amount: i * this.STARS_PER_CREDIT, // Amount in stars
        });
      }

      console.log(
        JSON.stringify([
          chatId,
          'Пополнение Баланса',
          'Выберите количество кредитов для пополнения. 150 звёзд = 1 кредит.',
          `add_credits_${Date.now()}`,
          process.env.TELEGRAM_PAYMENT_TOKEN || '',
          'XTR',
          prices,
        ]),
      );

      await this.bot.sendInvoice(
        chatId,
        'Пополнение Баланса',
        'Выберите количество кредитов для пополнения. 150 звёзд = 1 кредит.',
        `add_credits_${Date.now()}`,
        process.env.TELEGRAM_PAYMENT_TOKEN || '',
        'XTR',
        prices,
      );
    } catch (error) {
      console.error('Error creating payment configuration:', error);
      await this.bot.sendMessage(
        chatId,
        'Произошла ошибка при настройке платежа. Пожалуйста, попробуйте позже.',
      );
    }
  }

  // Helper method for Russian grammar - credit words
  private getCreditWord(count: number): string {
    const lastDigit = count % 10;
    const lastTwoDigits = count % 100;

    if (lastDigit === 1 && lastTwoDigits !== 11) {
      return 'кредит';
    } else if ([2, 3, 4].includes(lastDigit) && ![12, 13, 14].includes(lastTwoDigits)) {
      return 'кредита';
    } else {
      return 'кредитов';
    }
  }

  // Helper method for Russian grammar - session words
  private getSessionWord(count: number): string {
    const lastDigit = count % 10;
    const lastTwoDigits = count % 100;

    if (lastDigit === 1 && lastTwoDigits !== 11) {
      return 'сеанс';
    } else if ([2, 3, 4].includes(lastDigit) && ![12, 13, 14].includes(lastTwoDigits)) {
      return 'сеанса';
    } else {
      return 'сеансов';
    }
  }
}
