/**
 * MessageHistory Value Object - Stores conversation history with semantic analysis
 */

export interface TemporalMessage {
  id: string;
  content: string;
  timestamp: Date;
  sender: 'USER' | 'BOT';
  metadata?: {
    sentiment?: number;
    topicKeywords?: string[];
    urgency?: number;
  };
}

export interface EmotionVector {
  timestamp: Date;
  primaryEmotion: string;
  intensity: number;
  secondaryEmotions?: Record<string, number>;
}

export interface MessageHistory {
  messages: TemporalMessage[];
  sentimentTrends: EmotionVector[];
  contextKeywords: string[];
  lastAnalyzedAt?: Date;
}
