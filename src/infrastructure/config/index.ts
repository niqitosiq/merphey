import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env file
dotenv.config();

interface AzureOpenAIConfig {
  apiKey: string;
  endpoint: string;
  apiVersion: string;
}

interface TelegramConfig {
  botToken: string;
  webhookUrl?: string;
}

interface AppConfig {
  azureOpenAI: AzureOpenAIConfig;
  telegram: TelegramConfig;
  environment: 'development' | 'production';
  maxConversationLength: number;
  maxQuestionExchanges: number;
}

function validateConfig(config: Partial<AppConfig>): AppConfig {
  if (!config.azureOpenAI?.apiKey) {
    throw new Error('Azure OpenAI API key is required');
  }

  if (!config.azureOpenAI?.endpoint) {
    throw new Error('Azure OpenAI endpoint is required');
  }

  if (!config.telegram?.botToken) {
    throw new Error('Telegram bot token is required');
  }

  return {
    azureOpenAI: {
      apiKey: config.azureOpenAI.apiKey,
      endpoint: config.azureOpenAI.endpoint,
      apiVersion: config.azureOpenAI.apiVersion || '2023-12-01-preview',
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
  azureOpenAI: {
    apiKey: process.env.AZURE_OPENAI_API_KEY!,
    endpoint: process.env.AZURE_OPENAI_ENDPOINT!,
    apiVersion: process.env.AZURE_OPENAI_API_VERSION!,
  },
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN!,
    webhookUrl: process.env.TELEGRAM_WEBHOOK_URL,
  },
  environment: (process.env.NODE_ENV || 'development') as 'development' | 'production',
  maxConversationLength: parseInt(process.env.MAX_CONVERSATION_LENGTH || '50', 10),
  maxQuestionExchanges: parseInt(process.env.MAX_QUESTION_EXCHANGES || '5', 10),
});

export { config, AppConfig, AzureOpenAIConfig, TelegramConfig };
