import TelegramBot from 'node-telegram-bot-api';
import crypto from 'crypto';

export class WebhookValidator {
  constructor(private secretHash: string) {}

  public validateUpdate(update: TelegramBot.Update): boolean {
    if (!update || typeof update !== 'object') {
      return false;
    }

    // Validate the update signature if it exists
    const signature = this.generateSignature(JSON.stringify(update));
    if (signature !== this.secretHash) {
      console.warn('Invalid update signature');
      return false;
    }

    // Validate message structure
    if (update.message) {
      return this.validateMessage(update.message);
    }

    // Validate callback query structure
    if (update.callback_query) {
      return this.validateCallbackQuery(update.callback_query);
    }

    return false;
  }

  private validateMessage(message: TelegramBot.Message): boolean {
    return (
      typeof message.message_id === 'number' &&
      typeof message.chat?.id === 'number' &&
      (typeof message.text === 'string' || message.text === undefined)
    );
  }

  private validateCallbackQuery(query: TelegramBot.CallbackQuery): boolean {
    return (
      typeof query.id === 'string' &&
      typeof query.from?.id === 'number' &&
      (typeof query.data === 'string' || query.data === undefined)
    );
  }

  private generateSignature(data: string): string {
    return crypto.createHmac('sha256', this.secretHash).update(data).digest('hex');
  }
}
