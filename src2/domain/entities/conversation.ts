export interface HistoryMessage {
  text: string;
  from?: string;
  role?: string;
}

export interface ConversationContext {
  history: HistoryMessage[];
  isThinking?: boolean;
}
