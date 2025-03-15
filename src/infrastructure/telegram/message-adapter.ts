import TelegramBot from 'node-telegram-bot-api';
import { TelegramMessage } from './telegram-types';
import { ConversationState } from '../../domain/user-interaction/value-objects/conversation-state.value-object';

export class MessageAdapter {
  public toDomain(msg: TelegramBot.Message): TelegramMessage {
    if (!msg.from || !msg.text) {
      throw new Error('Invalid message format');
    }

    return {
      id: msg.message_id.toString(),
      from: {
        id: msg.from.id.toString(),
        name: msg.from.first_name + (msg.from.last_name ? ` ${msg.from.last_name}` : ''),
        username: msg.from.username,
      },
      text: msg.text,
      date: msg.date,
      metadata: {
        chatId: msg.chat.id,
        messageId: msg.message_id,
        state: ConversationState.INITIAL,
      },
    };
  }
}
