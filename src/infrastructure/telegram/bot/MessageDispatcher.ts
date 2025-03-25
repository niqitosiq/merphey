import TelegramBot from 'node-telegram-bot-api';
import { TextMessageHandler } from '../handlers/TextMessageHandler';
import { CommandHandler } from '../handlers/CommandHandler';
import { PaymentHandler } from '../handlers/PaymentHandler';
import { MentalHealthApplication } from '../../../application/MentalHealthApplication';
import { EventBus } from '../../../shared/events/EventBus';

/**
 * Dispatches incoming Telegram messages to appropriate handlers
 * Coordinates the flow of messages from the Telegram bot to the application
 */
export class MessageDispatcher {
  /**
   * Creates a new message dispatcher
   * @param textMessageHandler - Handler for regular text messages
   * @param commandHandler - Handler for command messages
   * @param application - Core application instance
   * @param token - Telegram bot API token
   */
  constructor(
    private readonly textMessageHandler: TextMessageHandler,
    private readonly commandHandler: CommandHandler,
    private readonly paymentHandler: PaymentHandler,
    private readonly bot: TelegramBot,
  ) {
    this.setupHandlers();
  }

  /**
   * Sets up message and command listeners for the Telegram bot
   */
  private setupHandlers(): void {
    // Handle text messages
    this.bot.on('text', async (msg) => {
      const userId = msg.from?.id.toString();

      if (!userId) {
        return;
      }

      // Check if message is a command
      if (msg.text?.startsWith('/')) {
        const command = msg.text.substring(1).split(' ')[0];
        
        // Handle payment command separately
        if (command === 'buy') {
          await this.paymentHandler.handlePaymentConfiguration(msg.chat.id);
          return;
        }

        const response = await this.commandHandler.handleCommand(userId, command);
        await this.bot.sendMessage(msg.chat.id, response);
        return;
      }

      // Handle regular text message
      const response = await this.textMessageHandler.handleMessage(userId, msg.text || '');
      await this.bot.sendMessage(msg.chat.id, response);
    });

    // Handle payment events
    this.bot.on('pre_checkout_query', (query) => this.paymentHandler.handlePreCheckoutQuery(query));
    this.bot.on('successful_payment', (msg) => this.paymentHandler.handleSuccessfulPayment(msg));

    // Handle errors
    this.bot.on('polling_error', (error) => {
      console.error('Polling error:', error);
    });

    this.bot.on('error', (error) => {
      console.error('Bot error:', error);
    });
  }

  /**
   * Starts the bot
   */
  async start(): Promise<void> {
    try {
      console.log('Bot started successfully');
    } catch (error) {
      console.error('Failed to start bot:', error);
      throw error;
    }
  }

  /**
   * Stops the bot
   */
  async stop(): Promise<void> {
    await this.bot.stopPolling();
    console.log('Bot stopped');
  }

  /**
   * Gets the bot instance
   */
  getBot(): TelegramBot {
    return this.bot;
  }
}
