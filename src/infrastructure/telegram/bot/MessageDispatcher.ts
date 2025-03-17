import { TextMessageHandler } from '../handlers/TextMessageHandler';
import { CommandHandler } from '../handlers/CommandHandler';
import { MentalHealthApplication } from '../../../application/MentalHealthApplication';
import TelegramBot from 'node-telegram-bot-api';
import { RiskLevel } from '../../../domain/shared/enums';
import { EventBus } from '../../../shared/events/EventBus';
import { EventTypes, AskUserToWaitEvent, SendTypingEvent } from '../../../shared/events/EventTypes';

/**
 * Dispatches incoming Telegram messages to appropriate handlers
 * Coordinates the flow of messages from the Telegram bot to the application
 */
export class MessageDispatcher {
  private bot: TelegramBot;

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
    private readonly application: MentalHealthApplication,
    token: string,
    private readonly eventBus: EventBus,
  ) {
    this.bot = new TelegramBot(token, { polling: true });
    this.setupListeners();
    this.setupEventBusListeners();
  }

  /**
   * Sets up message and command listeners for the Telegram bot
   */
  private setupListeners(): void {
    // Handle text messages
    this.bot.on('message', async (msg) => {
      // Skip non-text messages (stickers, photos, etc.)
      if (!msg.text) return;

      const userId = msg.from?.id.toString() || '';
      const messageText = msg.text;

      // Handle commands (messages starting with /)
      if (messageText.startsWith('/')) {
        const parts = messageText.substring(1).split(' ');
        const command = parts[0];
        const args = parts.slice(1);

        await this.dispatchCommand(userId, command, args);
      } else {
        // Handle regular text messages
        await this.dispatchTextMessage(userId, messageText);
      }
    });

    // Handle errors
    this.bot.on('polling_error', (error) => {
      console.error('Telegram polling error:', error);
    });
  }

  /**
   * Sets up event listeners for the event bus
   */
  private setupEventBusListeners(): void {
    // Listen for ASK_USER_TO_WAIT events
    this.eventBus.subscribe(EventTypes.ASK_USER_TO_WAIT, (data: AskUserToWaitEvent) =>
      this.handleAskUserToWait(data),
    );

    // Listen for SEND_TYPING events
    this.eventBus.subscribe(EventTypes.SEND_TYPING, (data: SendTypingEvent) =>
      this.handleSendTyping(data),
    );
  }

  /**
   * Handler for ASK_USER_TO_WAIT events
   * @param data - Event data containing userId and wait message
   */
  private async handleAskUserToWait(data: AskUserToWaitEvent): Promise<void> {
    try {
      const { userId, message } = data;

      console.log(`[${userId}] Sending wait message: ${this.truncateMessage(message)}`);

      await this.sendResponse(userId, message, { parse_mode: 'Markdown' });
    } catch (error) {
      console.error('Error handling ASK_USER_TO_WAIT event:', error);
    }
  }

  /**
   * Handler for SEND_TYPING events
   * @param data - Event data containing userId and optional duration
   */
  private async handleSendTyping(data: SendTypingEvent): Promise<void> {
    try {
      const { userId, durationMs = 3000 } = data;

      console.log(`[${userId}] Sending typing indicator for ${durationMs}ms`);

      await this.bot.sendChatAction(userId, 'typing');

      // For longer durations, we need to send the action multiple times
      // because Telegram's typing indicator only lasts about 5 seconds
      if (durationMs > 5000) {
        const intervals = Math.floor(durationMs / 4000);
        let remainingIntervals = intervals;

        const interval = setInterval(async () => {
          remainingIntervals--;

          if (remainingIntervals <= 0) {
            clearInterval(interval);
          } else {
            await this.bot.sendChatAction(userId, 'typing');
          }
        }, 4000);
      }
    } catch (error) {
      console.error('Error handling SEND_TYPING event:', error);
    }
  }

  /**
   * Dispatches text messages to the appropriate handler
   * @param userId - The Telegram user ID
   * @param message - The message text content
   * @returns Promise<void>
   */
  async dispatchTextMessage(userId: string, message: string): Promise<void> {
    try {
      console.log(`[${userId}] Received message: ${this.truncateMessage(message)}`);

      const response = await this.textMessageHandler.handleMessage(userId, message);

      await this.sendResponse(userId, response);
    } catch (error) {
      console.error(`Error handling message from ${userId}:`, error);
      await this.sendResponse(
        userId,
        'Извините, произошла ошибка при обработке вашего сообщения. Пожалуйста, попробуйте позже.',
      );
    }
  }

  /**
   * Dispatches command messages to the appropriate handler
   * @param userId - The Telegram user ID
   * @param command - The command name (without /)
   * @param args - Command arguments if any
   * @returns Promise<void>
   */
  async dispatchCommand(userId: string, command: string, args: string[]): Promise<void> {
    try {
      console.log(`[${userId}] Received command: /${command} ${args.join(' ')}`);

      const response = await this.commandHandler.handleCommand(userId, command);

      await this.sendResponse(userId, response);
    } catch (error) {
      console.error(`Error handling command /${command} from ${userId}:`, error);
      await this.sendResponse(
        userId,
        'Sorry, I encountered an error processing your command. Please try again later.',
      );
    }
  }

  /**
   * Sends response back to the user via Telegram
   * @param userId - The Telegram user ID
   * @param responseText - The text to send back to the user
   * @param options - Additional Telegram message options
   * @returns Promise<void>
   */
  async sendResponse(
    userId: string,
    responseText: string,
    options: TelegramBot.SendMessageOptions = {},
  ): Promise<void> {
    try {
      // Default options include markdown support
      const defaultOptions: TelegramBot.SendMessageOptions = {
        parse_mode: 'Markdown',
        ...options,
      };

      // Handle long messages - Telegram has a 4096 character limit
      if (responseText.length > 4000) {
        const chunks = this.splitMessage(responseText);

        for (const chunk of chunks) {
          await this.bot.sendMessage(userId, chunk, defaultOptions);
        }
      } else {
        await this.bot.sendMessage(userId, responseText, defaultOptions);
      }

      console.log(`[${userId}] Sent response: ${this.truncateMessage(responseText)}`);
    } catch (error) {
      console.error(`Error sending message to ${userId}:`, error);
    }
  }

  /**
   * Sends an emergency alert with resources to the user
   * @param userId - The Telegram user ID
   * @param riskLevel - The assessed risk level
   * @param resources - Crisis resources to share
   */
  async sendEmergencyAlert(userId: string, riskLevel: RiskLevel, resources: any[]): Promise<void> {
    let message = '⚠️ *Важные ресурсы поддержки* ⚠️\n\n';

    if (riskLevel === RiskLevel.CRITICAL) {
      message += 'Я вижу, что вам сейчас может быть очень тяжело.\n';
      message +=
        'Пожалуйста, рассмотрите возможность обратиться к одному из этих профессиональных ресурсов:\n\n';
    } else {
      message += 'Вот некоторые ресурсы, которые могут быть полезны:\n\n';
    }

    // Add resources to the message
    resources.forEach((resource) => {
      message += `*${resource.name}*: ${resource.contact}\n`;
      message += `${resource.description}\n\n`;
    });

    // Add footer message
    message +=
      'Помните, просить о помощи - это нормально. Профессиональная поддержка доступна 24/7.';

    // Send with high priority
    await this.sendResponse(userId, message, {
      disable_web_page_preview: false,
      parse_mode: 'Markdown',
    });
  }

  /**
   * Truncates a message for logging purposes
   * @param message - The message to truncate
   * @param maxLength - Maximum length before truncation
   * @returns truncated message
   */
  private truncateMessage(message: string, maxLength: number = 50): string {
    if (message.length <= maxLength) return message;
    return message.substring(0, maxLength) + '...';
  }

  /**
   * Splits a long message into chunks that fit within Telegram's limits
   * @param message - The long message to split
   * @param maxLength - Maximum length of each chunk
   * @returns string[] - Array of message chunks
   */
  private splitMessage(message: string, maxLength: number = 4000): string[] {
    const chunks: string[] = [];
    let remainingText = message;

    while (remainingText.length > 0) {
      let chunk: string;

      if (remainingText.length <= maxLength) {
        chunk = remainingText;
        remainingText = '';
      } else {
        // Try to find a natural break point (newline or space)
        let breakPoint = remainingText.substring(0, maxLength).lastIndexOf('\n\n');

        if (breakPoint < maxLength / 2) {
          breakPoint = remainingText.substring(0, maxLength).lastIndexOf(' ');
        }

        if (breakPoint > maxLength / 2) {
          chunk = remainingText.substring(0, breakPoint);
          remainingText = remainingText.substring(breakPoint + 1);
        } else {
          chunk = remainingText.substring(0, maxLength);
          remainingText = remainingText.substring(maxLength);
        }
      }

      // Add continuation marker if this isn't the last chunk
      if (remainingText.length > 0) {
        chunk += '\n_(продолжение следует...)_';
      }

      chunks.push(chunk);
    }

    return chunks;
  }
}
