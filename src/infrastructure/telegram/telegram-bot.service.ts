import { Telegraf } from 'telegraf';
import { ConversationService } from '../../domain/services/conversation.service';
import { config } from '../config';
import { LLMErrorHandler } from '../../utils/llm-error-handler';

export class TelegramBotService {
  private bot: Telegraf;

  constructor(private readonly conversationService: ConversationService) {
    this.bot = new Telegraf(config.telegram.botToken);
    this.setupHandlers();
  }

  private setupHandlers(): void {
    // Start command handler
    this.bot.command('start', async (ctx) => {
      await ctx.reply(
        'Здравствуйте! Я психолог-консультант. Расскажите, что вас беспокоит, и я постараюсь помочь.',
      );
    });

    // Reset conversation command
    this.bot.command('reset', async (ctx) => {
      await ctx.reply('Начнем сначала. Расскажите, что вас беспокоит.');
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

        // Handle user message
        const result = await LLMErrorHandler.withErrorHandling(async () => {
          try {
            // Try to process as a response to ongoing conversation
            return await this.conversationService.processUserResponse(userId, message);
          } catch (error: any) {
            if (error.message === 'No active session found') {
              // If no active session, start a new conversation
              await this.conversationService.startConversation(userId, message);
              return await this.conversationService.processUserResponse(userId, message);
            }
            throw error;
          }
        });

        await ctx.reply(result.response);

        if (result.isComplete) {
          await ctx.reply(
            'Наша беседа подошла к концу. Если у вас есть другие вопросы или темы для обсуждения, просто напишите их, и мы начнем новую беседу.',
          );
        }
      } catch (error: any) {
        console.error('Error processing message:', error);

        if (error.code === 'RATE_LIMIT_EXCEEDED') {
          await ctx.reply(
            'Извините, в данный момент слишком много запросов. Пожалуйста, подождите немного и попробуйте снова.',
          );
        } else {
          await ctx.reply(
            'Извините, произошла ошибка при обработке вашего сообщения. Пожалуйста, попробуйте позже или начните новую беседу с помощью команды /reset',
          );
        }
      }
    });
  }

  async start(): Promise<void> {
    if (config.environment === 'production' && config.telegram.webhookUrl) {
      // Set up webhook for production
      await this.bot.telegram.setWebhook(config.telegram.webhookUrl);
      console.log('Bot started with webhook');
    } else {
      // Use long polling for development
      await this.bot.launch();
      console.log('Bot started with long polling');
    }
  }

  async stop(): Promise<void> {
    await this.bot.stop();
  }
}
