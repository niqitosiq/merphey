// filepath: /Users/niqitosiq/pets/psychobot/src/infrastructure/telegram/bot/TelegramBot.ts
import { MessageDispatcher } from './MessageDispatcher';
import { TextMessageHandler } from '../handlers/TextMessageHandler';
import { CommandHandler } from '../handlers/CommandHandler';
import { MentalHealthApplication } from '../../../application/MentalHealthApplication';
import dotenv from 'dotenv';
import { EventBus } from 'src/shared/events/EventBus';

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

    private readonly eventBus: EventBus,
  ) {
    // Load environment variables
    dotenv.config();

    const token = process.env.TELEGRAM_BOT_TOKEN;

    if (!token) {
      throw new Error('TELEGRAM_BOT_TOKEN is not defined in environment variables');
    }

    // Create handlers
    const textMessageHandler = new TextMessageHandler(application);
    const commandHandler = new CommandHandler(application);

    // Create message dispatcher
    this.messageDispatcher = new MessageDispatcher(
      textMessageHandler,
      commandHandler,
      application,
      token,
      this.eventBus,
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
): TelegramBot {
  try {
    console.log('Starting Telegram bot...');
    const bot = new TelegramBot(application, eventBus);
    console.log('Telegram bot started successfully');
    return bot;
  } catch (error) {
    console.error('Failed to start Telegram bot:', error);
    throw error;
  }
}
