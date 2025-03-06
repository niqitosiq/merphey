export type HistoryMessage = {
  from?: 'psychologist' | 'user' | 'communicator' | 'proceeder';
  role?: 'system' | 'user' | 'assistant';
  text: string;
};

export interface ConversationContext {
  history: HistoryMessage[];
}
