import { Telegraf } from 'telegraf';
import { message } from 'telegraf/filters';
import { SessionRepository } from '../../domain/repositories/session.repository';
import { MessageProcessor } from '../../domain/services/message-processor.service';
import { HistoryMessage, ConversationState } from '../../domain/models/conversation';

export interface TelegramConfig {
  botToken: string;
  webhookUrl?: string;
  environment: 'development' | 'production';
}

export class TelegramBotService {
  private readonly bot: Telegraf;

  constructor(
    private readonly config: TelegramConfig,
    private readonly sessionRepository: SessionRepository,
    private readonly messageProcessor: MessageProcessor,
  ) {
    this.bot = new Telegraf(config.botToken, {
      handlerTimeout: 5 * 60 * 1000,
    });
    this.setupHandlers();
  }

  private setupHandlers(): void {
    // Start command handler
    this.bot.command('start', async (ctx) => {
      const userId = ctx.from.id.toString();
      const session = await this.sessionRepository.create(userId);
      await ctx.reply("👋 Hello! I'm here to help. How are you feeling today?");
    });

    // Reset command handler
    this.bot.command('reset', async (ctx) => {
      const userId = ctx.from.id.toString();
      await this.sessionRepository.delete(userId);
      const session = await this.sessionRepository.create(userId);
      await ctx.reply('Starting fresh. How can I help you today?');
    });

    // Help command handler
    this.bot.command('help', async (ctx) => {
      await ctx.reply(
        'Available commands:\n' +
          '/start - Start a new conversation\n' +
          '/reset - Reset current conversation\n' +
          '/help - Show this help message',
      );
    });

    // Status command handler
    this.bot.command('status', async (ctx) => {
      const userId = ctx.from.id.toString();
      const session = await this.sessionRepository.findByUserId(userId);

      if (!session) {
        await ctx.reply('No active session. Use /start to begin.');
        return;
      }

      await ctx.reply(
        'Current session status:\n' +
          `State: ${session.state}\n` +
          `Risk Level: ${session.riskLevel}\n` +
          `Duration: ${Math.floor((Date.now() - session.sessionStartTime) / 60000)} minutes\n` +
          `Messages: ${session.history.length}\n` +
          `Background Tasks: ${session.activeBackgroundTasks?.length || 0}`,
      );
    });

    // Message handler
    this.bot.on(message('text'), async (ctx) => {
      const userId = ctx.from.id.toString();
      const messageText = ctx.message.text;

      try {
        let session = await this.sessionRepository.findByUserId(userId);

        if (!session) {
          session = await this.sessionRepository.create(userId);
        }

        // Create message object
        const message: HistoryMessage = {
          text: messageText,
          from: 'user',
          role: 'user',
          timestamp: Date.now(),
        };

        // Add message to history
        session.history.push(message);
        await this.sessionRepository.update(session);

        // Show typing indicator
        await ctx.sendChatAction('typing');

        // Process message
        const response = await this.messageProcessor.processMessage(session, message);

        // Handle state transitions with appropriate delays and typing indicators
        if (response.transition) {
          await ctx.sendChatAction('typing');
          await new Promise((resolve) => setTimeout(resolve, 500));
        }

        // Add responses to history and update session
        response.messages.forEach((text) => {
          session!.history.push({
            text,
            from: 'assistant',
            role: 'assistant',
            timestamp: Date.now(),
            metadata: {
              riskLevel: response.riskLevel,
              stateTransition: response.transition
                ? {
                    from: session!.state,
                    to: response.transition.state,
                    reason: response.transition.reason,
                  }
                : undefined,
            },
          });
        });

        await this.sessionRepository.update(session);

        // Send responses with appropriate delays
        for (const text of response.messages) {
          await ctx.reply(text);
          if (response.messages.length > 1) {
            await new Promise((resolve) => setTimeout(resolve, 500));
          }
        }

        // Handle session ending
        if (response.shouldEndSession) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
          await ctx.reply('🌟 You can start a new conversation anytime with /start');
        }
      } catch (error) {
        console.error('Error processing message:', error);
        await ctx.reply(
          'I apologize, but I encountered an issue. Please try again or use /reset to start over.',
        );

        // Try to recover the session if possible
        const session = await this.sessionRepository.findByUserId(userId);
        if (session) {
          session.state = ConversationState.ERROR_RECOVERY;
          await this.sessionRepository.update(session);
        }
      }
    });
  }

  async start(): Promise<void> {
    if (this.config.environment === 'production' && this.config.webhookUrl) {
      await this.bot.telegram.setWebhook(this.config.webhookUrl);
      console.log('Bot started with webhook');
    } else {
      await this.bot.launch();
      console.log('Bot started with long polling');
    }
  }

  async stop(): Promise<void> {
    await this.bot.stop();
  }
}
