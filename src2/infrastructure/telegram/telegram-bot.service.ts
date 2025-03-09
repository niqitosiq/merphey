import { Telegraf } from 'telegraf';
import { message } from 'telegraf/filters';
import { config } from '../config';
import { UserSessionRepository } from '../../domain/repositories/user-session.repository';
import { proceedWithText, proceedWithTextSimple } from '../../domain/services/main.service';
import { HistoryMessage } from '../../domain/entities/conversation';

export class TelegramBotService {
  public bot: Telegraf;
  private readonly sessionRepository: UserSessionRepository;

  constructor(sessionRepository: UserSessionRepository) {
    this.bot = new Telegraf(config.telegram.botToken, {
      handlerTimeout: 5 * 60 * 1000,
      telegram: { webhookReply: false },
    });
    this.sessionRepository = sessionRepository;
    this.setupHandlers();
  }

  private setupHandlers(): void {
    // Start command handler
    this.bot.command('start', async (ctx) => {
      const userId = ctx.from.id.toString();
      this.sessionRepository.create({ userId });
      await ctx.reply('прив че дел');
    });

    // Reset conversation command
    this.bot.command('reset', async (ctx) => {
      const userId = ctx.from.id.toString();
      this.sessionRepository.create({ userId });
      await ctx.reply('ты че?');
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

    this.bot.on(message('text'), async (ctx) => {
      const userId = ctx.from.id.toString();
      const message = ctx.message.text;

      const session = await this.sessionRepository.findByUserId(userId);

      session?.history.push({
        text: message,
        from: 'user',
        role: 'user',
      });
      console.info(`Received message from user ${userId}: ${message}; ${JSON.stringify(session)}`);

      if (!session) {
        await ctx.reply(
          'Извините, произошла ошибка. Пожалуйста, начните новую беседу с помощью команды /start',
        );
        return;
      }

      const typingHandler = ctx.sendChatAction.bind(ctx, 'typing');
      const pushHistory = async (message: HistoryMessage) => {
        session.history.push(message);
        await this.sessionRepository.update(session);
      };
      const reply = (message: string) => ctx.reply(message);
      const updateIsThinking = async (isThinking: boolean) => {
        session.isThinking = isThinking;

        if (!isThinking) {
          setTimeout(async () => {
            session.isThinking = false;
            await this.sessionRepository.update(session);
          }, 1000 * 60);
        }
        await this.sessionRepository.update(session);
      };

      const messages = await proceedWithTextSimple(
        session,
        pushHistory,
        typingHandler,
        reply,
        updateIsThinking,
      );

      session.history.push(
        ...messages.map(
          (text) =>
            ({
              from: 'communicator',
              role: 'assistant',
              text,
            }) as HistoryMessage,
        ),
      );

      await this.sessionRepository.update(session);

      messages.forEach(async (message) => {
        await ctx.reply(message);
      });
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
