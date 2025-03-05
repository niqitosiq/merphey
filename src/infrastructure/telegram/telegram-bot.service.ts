import { Telegraf } from 'telegraf';
import { config } from '../config';
import { CommunicatorService } from '../../domain/services/communicator.service';
import { Logger } from '../../utils/logger';
import { ErrorBoundary } from '../../utils/error-boundary';
import { UserSessionRepository } from '../../domain/repositories/user-session.repository';

export class TelegramBotService {
  private bot: Telegraf;
  private readonly logger = Logger.getInstance();
  private readonly sessionRepository: UserSessionRepository;

  constructor(
    private readonly communicator: CommunicatorService,
    sessionRepository: UserSessionRepository,
  ) {
    this.bot = new Telegraf(config.telegram.botToken);
    this.sessionRepository = sessionRepository;
    this.setupHandlers();
  }

  private setupHandlers(): void {
    // Start command handler
    this.bot.command('start', async (ctx) => {
      const userId = ctx.from.id.toString();
      const greeting = await ErrorBoundary.wrap(() => this.communicator.startConversation(userId), {
        userId,
        step: 'start_conversation',
      });
      this.sessionRepository.create({ userId });
      await ctx.reply(greeting);
    });

    // Reset conversation command
    this.bot.command('reset', async (ctx) => {
      const userId = ctx.from.id.toString();
      const greeting = await ErrorBoundary.wrap(() => this.communicator.startConversation(userId), {
        userId,
        step: 'reset_conversation',
      });
      this.sessionRepository.create({ userId });
      await ctx.reply(greeting);
    });

    // Help command
    this.bot.command('help', async (ctx) => {
      await ctx.reply(
        'Доступные команды:\n' +
          '/start - Начать новую беседу\n' +
          '/reset - Сбросить текущую беседу\n' +
          '/help - Показать это сообщение',
      );
    });

    // Message handler
    this.bot.on('text', async (ctx) => {
      const userId = ctx.from.id.toString();
      const message = ctx.message.text;

      try {
        await ctx.sendChatAction('typing');

        // Everything goes through the communicator
        const response = await ErrorBoundary.wrap(
          () => this.communicator.handleUserMessage(userId, message),
          { userId, step: 'handle_message' },
        );

        // Send all responses
        for (const reply of response.messages) {
          await ctx.reply(reply);
        }

        // If session should end, send a final message after a delay
        if (response.shouldEndSession) {
          await new Promise((resolve) => setTimeout(resolve, 2000));
          await ctx.reply('💫 Вы можете начать новую беседу с помощью команды /start');
        }
      } catch (error: any) {
        this.logger.error('Error processing message:', error);
        await ctx.reply(
          'Извините, произошла ошибка. Пожалуйста, попробуйте позже или начните новую беседу с помощью команды /reset',
        );
      }
    });
  }

  async start(): Promise<void> {
    if (config.environment === 'production' && config.telegram.webhookUrl) {
      await this.bot.telegram.setWebhook(config.telegram.webhookUrl);
      this.logger.info('Bot started with webhook');
    } else {
      await this.bot.launch();
      this.logger.info('Bot started with long polling');
    }
  }

  async stop(): Promise<void> {
    await this.bot.stop();
  }
}
