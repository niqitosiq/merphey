import TelegramBot from 'node-telegram-bot-api';

export class ErrorHandler {
  constructor(private bot: TelegramBot) {}

  private extractChatId(context: unknown): number | undefined {
    if (this.isTelegramMessage(context)) {
      return context.chat.id;
    }
    if (this.isTelegramCallback(context)) {
      return context.message?.chat.id;
    }
    return undefined;
  }

  private isTelegramMessage(context: unknown): context is TelegramBot.Message {
    return (context as TelegramBot.Message)?.chat !== undefined;
  }

  private isTelegramCallback(context: unknown): context is TelegramBot.CallbackQuery {
    return (context as TelegramBot.CallbackQuery)?.message !== undefined;
  }

  public async handle(error: Error, context?: unknown): Promise<void> {
    console.error('Telegram Bot Error:', {
      message: error.message,
      stack: error.stack,
      context: context ? JSON.stringify(context) : 'No context',
    });

    const chatId = this.extractChatId(context);
    if (chatId) {
      await this.bot
        .sendMessage(
          chatId,
          'I apologize, but I encountered an error. Please try again or wait a moment.',
        )
        .catch((err) => {
          console.error('Failed to send error message:', err);
        });
    }
  }
}
