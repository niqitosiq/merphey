import { User } from '../../domain/user-interaction/entities/user.entity';
import { ConversationState } from '../../domain/user-interaction/value-objects/conversation-state.value-object';
import TelegramBot from 'node-telegram-bot-api';

export interface TelegramConfig {
  token: string;
  webhookUrl?: string;
  isDevelopment: boolean;
  rateLimitPerMinute: number;
  secretHash: string;
}

export interface TelegramMessage {
  id: string;
  from: {
    id: string;
    name: string;
    username?: string;
  };
  text: string;
  date: number;
  metadata: {
    chatId: number;
    messageId: number;
    state: ConversationState;
  };
}

export interface TelegramResponse {
  text: string;
  parseMode?: 'MarkdownV2' | 'HTML';
  markup?: TelegramBot.InlineKeyboardMarkup;
  actions?: TelegramAction[];
}

export interface TelegramSession {
  user: User;
  state: ConversationState;
  lastInteraction: Date;
}

export type TelegramCallbackAction =
  | 'RISK_ACK'
  | 'PLAN_STEP'
  | 'START'
  | 'HELP'
  | 'ASSESSMENT'
  | 'INTERVENTION'
  | 'PLAN'
  | 'CLOSURE';

export interface TelegramAction {
  type: TelegramCallbackAction;
  label: string;
  value: string;
}
