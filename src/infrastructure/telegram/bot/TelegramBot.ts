import { MessageDispatcher } from './MessageDispatcher';
import TelegramBotLib from 'node-telegram-bot-api';
import { TextMessageHandler } from '../handlers/TextMessageHandler';
import { CommandHandler } from '../handlers/CommandHandler';
import { MentalHealthApplication } from '../../../application/MentalHealthApplication';
import dotenv from 'dotenv';
import { EventBus } from '../../../shared/events/EventBus';
import { PaymentHandler } from '../handlers/PaymentHandler';
import { PaymentService } from '../../../domain/services/payment/PaymentService';
import { UserRepository } from '../../../infrastructure/persistence/postgres/UserRepository';
import { PaymentRepository } from '../../../infrastructure/persistence/postgres/PaymentRepository';
import { SessionService } from 'src/domain/services/session/SessionService';

/**
 * Main Telegram bot class that bootstraps the bot functionality
 * Initializes the bot with necessary handlers and configuration
 */
export class TelegramBot {
  private messageDispatcher: MessageDispatcher;

  /**
   * Creates and initializes the Telegram bot
   * @param application - The core application instance
   */
  constructor(
    private readonly application: MentalHealthApplication,
    private readonly paymentService: PaymentService,
    private readonly userRepository: UserRepository,
    private readonly eventBus: EventBus,

    private readonly sessionService: SessionService,
  ) {
    // Load environment variables
    dotenv.config();

    const token = process.env.TELEGRAM_BOT_TOKEN;

    if (!token) {
      throw new Error('TELEGRAM_BOT_TOKEN is not defined in environment variables');
    }

    // Create handlers
    const textMessageHandler = new TextMessageHandler(application, this.sessionService, eventBus);
    const commandHandler = new CommandHandler(application, this.userRepository);

    const bot = new TelegramBotLib(token, { polling: true });
    const paymentHandler = new PaymentHandler(bot, this.paymentService, userRepository, eventBus);

    // Create message dispatcher
    this.messageDispatcher = new MessageDispatcher(
      textMessageHandler,
      commandHandler,
      paymentHandler,
      bot,
    );

    console.log('Telegram bot initialized and ready to handle messages');
  }

  /**
   * Gets the message dispatcher instance
   * @returns MessageDispatcher
   */
  public getMessageDispatcher(): MessageDispatcher {
    return this.messageDispatcher;
  }
}

/**
 * Function to start the Telegram bot
 * @param application - The core application instance
 * @returns TelegramBot instance
 */
export function startTelegramBot(
  application: MentalHealthApplication,
  eventBus: EventBus,
  paymentService: PaymentService,
  userRepository: UserRepository,
  sessionService: SessionService,
): TelegramBot {
  try {
    console.log('Starting Telegram bot...');
    const bot = new TelegramBot(
      application,
      paymentService,
      userRepository,
      eventBus,
      sessionService,
    );
    console.log('Telegram bot started successfully');
    return bot;
  } catch (error) {
    console.error('Failed to start Telegram bot:', error);
    throw error;
  }
}
