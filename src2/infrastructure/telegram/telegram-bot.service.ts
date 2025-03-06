import { Telegraf } from 'telegraf';
import { config } from '../config';
import { UserSessionRepository } from '../../domain/repositories/user-session.repository';

export class TelegramBotService {
  public bot: Telegraf;
  private readonly sessionRepository: UserSessionRepository;

  constructor(sessionRepository: UserSessionRepository) {
    this.bot = new Telegraf(config.telegram.botToken, { handlerTimeout: 5 * 60 * 1000 });
    this.sessionRepository = sessionRepository;
    this.setupHandlers();
  }

  private setupHandlers(): void {
    // Start command handler
    this.bot.command('start', async (ctx) => {
      const userId = ctx.from.id.toString();
      const greeting = this.communicator.startConversation(userId);
      this.sessionRepository.create({ userId });
      await ctx.reply(greeting);
    });

    // Reset conversation command
    this.bot.command('reset', async (ctx) => {
      const userId = ctx.from.id.toString();
      const greeting = this.communicator.startConversation(userId);
      this.sessionRepository.create({ userId });
      await ctx.reply(greeting);
    });

    // Help command
    this.bot.command('help', async (ctx) => {
      await ctx.reply(
        'Доступные команды:\n' +
          '/start - Начать новую беседу\n' +
          '/reset - Сбросить текущую беседу\n' +
          '/personal - Получить отчет о своем психологическом состоянии\n' +
          '/help - Показать это сообщение',
      );
    });

    this.bot.on('text', async (ctx) => {
      const userId = ctx.from.id.toString();
      const message = ctx.message.text;

      try {
        await ctx.sendChatAction('typing');
      } catch (error: any) {
        await ctx.reply(
          'Извините, произошла ошибка. Пожалуйста, попробуйте позже или начните новую беседу с помощью команды /reset',
        );
      }
    });
  }

  async start(): Promise<void> {
    if (config.environment === 'production' && config.telegram.webhookUrl) {
      await this.bot.telegram.setWebhook(config.telegram.webhookUrl);
    } else {
      await this.bot.launch();
    }
  }

  async stop(): Promise<void> {
    await this.bot.stop();
  }
}
