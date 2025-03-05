import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env file
dotenv.config();

interface AzureOpenAIConfig {
  apiKey: string;
  endpoint: string;
  apiVersion: string;
}

interface GeminiConfig {
  apiKey: string;
}

interface AIConfig {
  provider: 'openai' | 'gemini';
  openai?: AzureOpenAIConfig;
  gemini?: GeminiConfig;
}

interface TelegramConfig {
  botToken: string;
  webhookUrl?: string;
}

interface AppConfig {
  ai: AIConfig;
  telegram: TelegramConfig;
  environment: 'development' | 'production';
  maxConversationLength: number;
  maxQuestionExchanges: number;
}

function validateConfig(config: Partial<AppConfig>): AppConfig {
  if (!config.ai?.provider) {
    throw new Error('AI provider is required');
  }

  if (config.ai.provider === 'openai' && !config.ai.openai?.apiKey) {
    throw new Error('OpenAI API key is required when using OpenAI provider');
  }

  if (config.ai.provider === 'gemini' && !config.ai.gemini?.apiKey) {
    throw new Error('Gemini API key is required when using Gemini provider');
  }

  if (!config.telegram?.botToken) {
    throw new Error('Telegram bot token is required');
  }

  return {
    ai: {
      provider: config.ai.provider,
      openai: config.ai.openai
        ? {
            apiKey: config.ai.openai.apiKey,
            endpoint: config.ai.openai.endpoint || '',
            apiVersion: config.ai.openai.apiVersion || '2023-12-01-preview',
          }
        : undefined,
      gemini: config.ai.gemini
        ? {
            apiKey: config.ai.gemini.apiKey,
          }
        : undefined,
    },
    telegram: {
      botToken: config.telegram.botToken,
      webhookUrl: config.telegram.webhookUrl,
    },
    environment: config.environment || 'development',
    maxConversationLength: config.maxConversationLength || 50,
    maxQuestionExchanges: config.maxQuestionExchanges || 5,
  };
}

// Load configuration from environment variables
const config: AppConfig = validateConfig({
  ai: {
    provider: (process.env.AI_PROVIDER as 'openai' | 'gemini') || 'openai',
    openai: {
      apiKey: process.env.AZURE_OPENAI_API_KEY!,
      endpoint: process.env.AZURE_OPENAI_ENDPOINT!,
      apiVersion: process.env.AZURE_OPENAI_API_VERSION!,
    },
    gemini: {
      apiKey: process.env.GEMINI_API_KEY!,
    },
  },
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN!,
    webhookUrl: process.env.TELEGRAM_WEBHOOK_URL,
  },
  environment: (process.env.NODE_ENV || 'development') as 'development' | 'production',
  maxConversationLength: parseInt(process.env.MAX_CONVERSATION_LENGTH || '50', 10),
  maxQuestionExchanges: parseInt(process.env.MAX_QUESTION_EXCHANGES || '5', 10),
});

export { config, AppConfig, AzureOpenAIConfig, GeminiConfig, AIConfig, TelegramConfig };
