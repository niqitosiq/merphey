import TelegramBot from 'node-telegram-bot-api';
import { InlineKeyboardHandler } from './inline-keyboard';

export class CommandHandler {
  constructor(
    private bot: TelegramBot,
    private keyboardHandler: InlineKeyboardHandler,
  ) {}

  public async handleStart(msg: TelegramBot.Message): Promise<void> {
    const chatId = msg.chat.id;
    const name = msg.from?.first_name || 'there';

    await this.bot.sendMessage(
      chatId,
      `Hello ${name}! 👋\n\n` +
        "I am your therapeutic companion bot. I'm here to support your mental well-being journey.\n\n" +
        'To get started, please choose an option below:',
      {
        reply_markup: this.keyboardHandler.createStartKeyboard(),
      },
    );
  }

  public async handleHelp(msg: TelegramBot.Message): Promise<void> {
    const chatId = msg.chat.id;

    await this.bot.sendMessage(
      chatId,
      '🤝 *How can I help you?*\n\n' +
        'Here are the available commands:\n' +
        '• /start - Begin or restart your therapeutic journey\n' +
        '• /help - Show this help message\n\n' +
        'You can:\n' +
        '• Share your thoughts and feelings with me\n' +
        '• Ask for guidance or support\n' +
        '• Complete therapeutic exercises\n' +
        '• Track your progress\n\n' +
        'Remember: In case of emergency, always contact professional help or emergency services.',
      {
        parse_mode: 'MarkdownV2',
      },
    );
  }

  public registerCommands(): void {
    this.bot.onText(/\/start/, this.handleStart.bind(this));
    this.bot.onText(/\/help/, this.handleHelp.bind(this));
  }
}
