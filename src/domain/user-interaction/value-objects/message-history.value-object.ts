/**
 * MessageHistory Value Object - Stores conversation history with semantic analysis
 */

export interface EmotionVector {
  id: string;
  timestamp: Date;
  primaryEmotion: string;
  intensity: number;
  secondaryEmotions: string | null;
  historyId: string;
}
