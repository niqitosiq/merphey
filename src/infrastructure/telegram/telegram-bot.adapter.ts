import TelegramBot from 'node-telegram-bot-api';
import { MessageAdapter } from './message-adapter';
import { ResponseAdapter } from './response-adapter';
import { CommandHandler } from './callbacks/command-handler';
import { InlineKeyboardHandler } from './callbacks/inline-keyboard';
import { RateLimiter } from './middleware/rate-limiter';
import { AuthMiddleware } from './middleware/auth-middleware';
import { ErrorHandler } from './middleware/error-handler';
import { WebhookValidator } from './utilities/webhook-validator';
import { Formatter } from './utilities/formatter';
import { MessageProcessor } from '../../application/services/message-processing.service';
import { TelegramConfig } from './telegram-types';
import { UserRepository } from '@domain/user-interaction/repositories/user.repository';

export class TelegramBotAdapter {
  private bot!: TelegramBot;
  private messageAdapter!: MessageAdapter;
  private responseAdapter!: ResponseAdapter;
  private formatter!: Formatter;
  private commandHandler!: CommandHandler;
  private keyboardHandler!: InlineKeyboardHandler;
  private rateLimiter!: RateLimiter;
  private authMiddleware!: AuthMiddleware;
  private errorHandler!: ErrorHandler;
  private webhookValidator!: WebhookValidator;
  private userRepository!: UserRepository;

  constructor(
    private config: TelegramConfig,
    private messageProcessor: MessageProcessor,
    private userRepository: UserRepository,
  ) {
    this.initializeComponents();
    this.setupBot();
    this.setupEventHandlers();
  }

  private initializeComponents(): void {
    this.formatter = new Formatter();
    this.messageAdapter = new MessageAdapter();
    this.rateLimiter = new RateLimiter(this.config.rateLimitPerMinute);
    this.authMiddleware = new AuthMiddleware();
    this.webhookValidator = new WebhookValidator(this.config.secretHash);
  }

  private setupBot(): void {
    const options: TelegramBot.ConstructorOptions = {
      polling: this.config.isDevelopment,
    };

    if (!this.config.isDevelopment && this.config.webhookUrl) {
      options.webHook = {
        port: parseInt(new URL(this.config.webhookUrl).port, 10) || 443,
        host: new URL(this.config.webhookUrl).hostname,
      };
    }

    this.bot = new TelegramBot(this.config.token, options);

    this.errorHandler = new ErrorHandler(this.bot);
    this.responseAdapter = new ResponseAdapter(this.bot, this.formatter);
    this.keyboardHandler = new InlineKeyboardHandler(this.bot);
    this.commandHandler = new CommandHandler(this.bot, this.keyboardHandler);
  }

  private setupEventHandlers(): void {
    // Register command handlers
    this.commandHandler.registerCommands();

    // Handle regular messages
    this.bot.on('message', async (msg) => {
      try {
        if (!msg.text || msg.text.startsWith('/')) return;

        await this.rateLimiter.handle(msg);
        await this.authMiddleware.handle(msg);

        if (!msg.from) {
          throw new Error('Message must have a sender');
        }

        const user = this.userRepository.findById(String(msg.from.id));

        const domainMessage = this.messageAdapter.toDomain(msg);
        const processedResponse = await this.messageProcessor.processMessage(
          domainMessage,
          this.userAggregate,
          this.planAggregate,
        );

        // Convert ProcessedResponse to TelegramResponse
        await this.responseAdapter.send(msg.chat.id, {
          text: processedResponse.text,
          parseMode: 'MarkdownV2',
          markup: processedResponse.triggerAction
            ? this.keyboardHandler.createKeyboardForAction(processedResponse.triggerAction)
            : undefined,
        });
      } catch (error) {
        if (error instanceof Error) {
          await this.errorHandler.handle(error, msg);
        } else {
          await this.errorHandler.handle(new Error('Unknown error occurred'), msg);
        }
      }
    });

    // Handle callback queries
    this.bot.on('callback_query', async (query) => {
      try {
        const updateObj = {
          update_id: Date.now(),
          callback_query: query,
        };

        if (!this.webhookValidator.validateUpdate(updateObj)) {
          throw new Error('Invalid callback query format');
        }

        await this.keyboardHandler.handleCallback(query);
      } catch (error) {
        if (error instanceof Error) {
          await this.errorHandler.handle(error, query);
        } else {
          await this.errorHandler.handle(new Error('Unknown error occurred'), query);
        }
      }
    });

    // Handle webhook updates if in production
    if (!this.config.isDevelopment && this.config.webhookUrl) {
      this.bot.on('webhook_error', async (error) => {
        await this.errorHandler.handle(new Error(error.message));
      });
    }
  }

  public async start(): Promise<void> {
    if (!this.config.isDevelopment && this.config.webhookUrl) {
      await this.bot.setWebHook(this.config.webhookUrl);
      console.log('Webhook set:', this.config.webhookUrl);
    }
    console.log('Telegram bot started successfully');
  }

  public async stop(): Promise<void> {
    if (this.config.isDevelopment) {
      await this.bot.stopPolling();
    }
    await this.bot.close();
  }
}
