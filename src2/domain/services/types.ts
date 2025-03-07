import { HistoryMessage } from '../entities/conversation';
import { ChatCompletionMessageParam } from 'openai/resources';

export type HistoryPusher = (message: HistoryMessage) => void;
export type TypingIndicator = () => void;
export type UserReply = (message: string) => void;

export const mapMessagesToLlmFormat = (messages: HistoryMessage[]): ChatCompletionMessageParam[] =>
  messages.map((m) => ({ role: m.role || 'user', content: m.text }));

export const formatConversationHistory = (history: HistoryMessage[]): string =>
  history.map((h) => `[${h.from || 'unknown'}]: "${h.text}"`).join('\n');
