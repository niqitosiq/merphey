import TelegramBot from 'node-telegram-bot-api';
import { TelegramResponse } from './telegram-types';
import { Formatter } from './utilities/formatter';

export class ResponseAdapter {
  constructor(
    private bot: TelegramBot,
    private formatter: Formatter,
  ) {}

  public async send(chatId: number, response: TelegramResponse): Promise<void> {
    const options: TelegramBot.SendMessageOptions = {
      parse_mode: response.parseMode || 'MarkdownV2',
      reply_markup: response.markup,
    };

    const text =
      response.parseMode === 'MarkdownV2'
        ? this.formatter.escapeMarkdown(response.text)
        : response.text;

    await this.bot.sendMessage(chatId, text, options);
  }

  public async editMessage(
    chatId: number,
    messageId: number,
    response: TelegramResponse,
  ): Promise<void> {
    const options: TelegramBot.EditMessageTextOptions = {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: response.parseMode || 'MarkdownV2',
      reply_markup: response.markup,
    };

    const text =
      response.parseMode === 'MarkdownV2'
        ? this.formatter.escapeMarkdown(response.text)
        : response.text;

    await this.bot.editMessageText(text, options);
  }

  public async sendTypingAction(chatId: number): Promise<void> {
    await this.bot.sendChatAction(chatId, 'typing');
  }

  public async deleteMessage(chatId: number, messageId: number): Promise<void> {
    await this.bot.deleteMessage(chatId, messageId);
  }
}
