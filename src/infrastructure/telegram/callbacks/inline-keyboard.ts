import TelegramBot from 'node-telegram-bot-api';
import { TelegramCallbackAction } from '../telegram-types';

export class InlineKeyboardHandler {
  constructor(private bot: TelegramBot) {}

  public createKeyboardForAction(action: string): TelegramBot.InlineKeyboardMarkup {
    switch (action) {
      case 'ESCALATE_TO_CRISIS_SUPPORT':
        return this.createRiskKeyboard();
      case 'TRANSITION_TO_ASSESSMENT':
        return this.createAssessmentKeyboard();
      case 'TRANSITION_TO_INTERVENTION':
        return this.createInterventionKeyboard();
      case 'UPDATE_PLAN':
        return this.createPlanUpdateKeyboard();
      case 'PREPARE_FOR_CLOSURE':
        return this.createClosureKeyboard();
      case 'START':
        return this.createStartKeyboard();
      default:
        return { inline_keyboard: [] };
    }
  }

  public createStartKeyboard(): TelegramBot.InlineKeyboardMarkup {
    return {
      inline_keyboard: [
        [
          {
            text: '📝 Begin Assessment',
            callback_data: 'START:ASSESSMENT',
          },
        ],
        [
          {
            text: '❓ Help',
            callback_data: 'START:HELP',
          },
        ],
      ],
    };
  }

  public createRiskKeyboard(): TelegramBot.InlineKeyboardMarkup {
    return {
      inline_keyboard: [
        [
          {
            text: '🆘 Contact Crisis Support',
            callback_data: 'RISK_ACK:CRISIS',
          },
        ],
        [
          {
            text: "✅ I'm okay, continue",
            callback_data: 'RISK_ACK:CONTINUE',
          },
        ],
      ],
    };
  }

  public createAssessmentKeyboard(): TelegramBot.InlineKeyboardMarkup {
    return {
      inline_keyboard: [
        [
          {
            text: '👍 Ready to continue',
            callback_data: 'ASSESSMENT:CONTINUE',
          },
        ],
        [
          {
            text: '🤔 Need more time',
            callback_data: 'ASSESSMENT:MORE_TIME',
          },
        ],
      ],
    };
  }

  public createInterventionKeyboard(): TelegramBot.InlineKeyboardMarkup {
    return {
      inline_keyboard: [
        [
          {
            text: '✅ Complete current step',
            callback_data: 'INTERVENTION:COMPLETE_STEP',
          },
        ],
        [
          {
            text: '➡️ Next step',
            callback_data: 'INTERVENTION:NEXT_STEP',
          },
        ],
      ],
    };
  }

  public createPlanUpdateKeyboard(): TelegramBot.InlineKeyboardMarkup {
    return {
      inline_keyboard: [
        [
          {
            text: '✅ Accept changes',
            callback_data: 'PLAN:ACCEPT',
          },
        ],
        [
          {
            text: '❌ Keep current plan',
            callback_data: 'PLAN:KEEP',
          },
        ],
      ],
    };
  }

  public createClosureKeyboard(): TelegramBot.InlineKeyboardMarkup {
    return {
      inline_keyboard: [
        [
          {
            text: '👋 Complete session',
            callback_data: 'CLOSURE:COMPLETE',
          },
        ],
        [
          {
            text: '🔄 Schedule next session',
            callback_data: 'CLOSURE:SCHEDULE',
          },
        ],
      ],
    };
  }

  public createPlanStepsKeyboard(steps: string[]): TelegramBot.InlineKeyboardMarkup {
    return {
      inline_keyboard: steps.map((step) => [
        {
          text: step,
          callback_data: `PLAN_STEP:${step}`,
        },
      ]),
    };
  }

  public async handleCallback(query: TelegramBot.CallbackQuery): Promise<void> {
    if (!query.data || !query.message) return;

    const [action, payload] = query.data.split(':') as [TelegramCallbackAction, string];
    const chatId = query.message.chat.id;

    try {
      switch (action) {
        case 'RISK_ACK':
          await this.handleRiskAcknowledgment(chatId, payload);
          break;
        case 'PLAN_STEP':
          await this.handlePlanStep(chatId, payload);
          break;
        case 'START':
          await this.handleStart(chatId, payload);
          break;
        case 'HELP':
          await this.handleHelp(chatId);
          break;
      }
    } finally {
      await this.bot.answerCallbackQuery(query.id);
    }
  }

  private async handleRiskAcknowledgment(chatId: number, payload: string): Promise<void> {
    if (payload === 'CRISIS') {
      await this.bot.sendMessage(
        chatId,
        '🚨 *Emergency Resources*\n\n' +
          '1. Emergency Services: 911\n' +
          '2. Crisis Text Line: Text HOME to 741741\n' +
          '3. National Suicide Prevention Lifeline: 1-800-273-8255\n\n' +
          '_Please reach out to these services if you need immediate help._',
        { parse_mode: 'MarkdownV2' },
      );
    }
  }

  private async handlePlanStep(chatId: number, step: string): Promise<void> {
    await this.bot.sendMessage(chatId, `Starting step: ${step}`, { parse_mode: 'MarkdownV2' });
  }

  private async handleStart(chatId: number, payload: string): Promise<void> {
    if (payload === 'ASSESSMENT') {
      await this.bot.sendMessage(
        chatId,
        "Let's begin your assessment. I'll ask you a few questions to understand how I can help you better.",
        { parse_mode: 'MarkdownV2' },
      );
    }
  }

  private async handleHelp(chatId: number): Promise<void> {
    await this.bot.sendMessage(
      chatId,
      "Here's how to use this bot:\n" +
        '1. /start - Begin or restart your therapeutic journey\n' +
        '2. /help - Show this help message\n\n' +
        'You can talk to me naturally about your thoughts and feelings.',
      { parse_mode: 'MarkdownV2' },
    );
  }
}
