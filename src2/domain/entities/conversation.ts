export interface HistoryMessage {
  text: string;
  from?: 'user' | 'communicator' | 'psychologist';
  role?: string;
}

export interface ConversationContext {
  history: HistoryMessage[];
  isThinking?: boolean;
}
