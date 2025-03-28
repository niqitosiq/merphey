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
import { scoped, Lifecycle, injectable, autoInjectable, container } from 'tsyringe';

/**
 * Main Telegram bot class that bootstraps the bot functionality
 * Initializes the bot with necessary handlers and configuration
 */

@scoped(Lifecycle.ContainerScoped)
@injectable()
@autoInjectable()
export class TelegramBot {
  private messageDispatcher: MessageDispatcher | null = null;

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
   
  }

  bootstrap(){
	 // Load environment variables
    dotenv.config();

    const token = process.env.TELEGRAM_BOT_TOKEN;

    if (!token) {
      throw new Error('TELEGRAM_BOT_TOKEN is not defined in environment variables');
    }

    // Create handlers
    const textMessageHandler = container.resolve(TextMessageHandler)
    const commandHandler = container.resolve(CommandHandler)
    const userRepository = container.resolve(UserRepository)
    const eventBus = container.resolve(EventBus)

    const bot = new TelegramBotLib(token, { polling: true });

    this.eventBus.subscribe('SEND_TYPING', (data) => {
      const { userId } = data;
      bot.sendChatAction(userId, 'typing');
    });

    this.eventBus.subscribe('ASK_USER_TO_WAIT', (data) => {
      const { userId, message } = data;
      bot.sendMessage(userId, message);
    });

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
  public getMessageDispatcher(): MessageDispatcher | null {
    return this.messageDispatcher;
  }
}

