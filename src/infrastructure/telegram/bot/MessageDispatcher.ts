import { TextMessageHandler } from '../handlers/TextMessageHandler';
import { CommandHandler } from '../handlers/CommandHandler';
import { MentalHealthApplication } from '../../../application/MentalHealthApplication';
import TelegramBot from 'node-telegram-bot-api';
import { RiskLevel } from '../../../domain/shared/enums';

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
  ) {
    this.bot = new TelegramBot(token, { polling: true });
    this.setupListeners();
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
        'Sorry, I encountered an error processing your message. Please try again later.',
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

      const response = await this.commandHandler.handleCommand(userId, command, args);

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
    let message = '⚠️ *Important Support Resources* ⚠️\n\n';

    if (riskLevel === RiskLevel.CRITICAL) {
      message += 'I notice you may be going through a difficult time right now.\n';
      message += 'Please consider reaching out to one of these professional resources:\n\n';
    } else {
      message += 'Here are some resources that might be helpful:\n\n';
    }

    // Add resources to the message
    resources.forEach((resource, index) => {
      message += `*${resource.name}*: ${resource.contact}\n`;
      message += `${resource.description}\n\n`;
    });

    // Add footer message
    message += "Remember, it's okay to ask for help. Professional support is available 24/7.";

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
          // If no good break point, just cut at maxLength
          chunk = remainingText.substring(0, maxLength);
          remainingText = remainingText.substring(maxLength);
        }
      }

      chunks.push(chunk);
    }

    return chunks;
  }
}
