import { TelegramBotService, TelegramConfig } from './infrastructure/telegram/telegram-bot.service';
import { StateManager } from './domain/services/state-manager.service';
import {
  MessageProcessor,
  MessageProcessorConfig,
} from './domain/services/message-processor.service';
import { LlmService, LlmConfig } from './domain/services/llm.service';
import { InMemorySessionRepository } from './domain/repositories/session.repository';
import dotenv from 'dotenv';

dotenv.config();

const telegramConfig: TelegramConfig = {
  botToken: process.env.TELEGRAM_BOT_TOKEN || '',
  environment: (process.env.NODE_ENV as 'development' | 'production') || 'development',
  webhookUrl: process.env.WEBHOOK_URL,
};

const llmConfig: LlmConfig = {
  apiKey: process.env.OPENAI_API_KEY || '',
  lowTierModel: process.env.LOW_TIER_MODEL || 'gpt-3.5-turbo',
  highTierModel: process.env.HIGH_TIER_MODEL || 'gpt-4-turbo-preview',
  maxRetries: Number(process.env.LLM_MAX_RETRIES) || 3,
  timeoutMs: Number(process.env.LLM_TIMEOUT_MS) || 30000,
};

const messageProcessorConfig: MessageProcessorConfig = {
  lowTierModel: llmConfig.lowTierModel,
  highTierModel: llmConfig.highTierModel,
  enableBackgroundProcessing: process.env.ENABLE_BACKGROUND_PROCESSING === 'true',
  maxBackgroundTasks: Number(process.env.MAX_BACKGROUND_TASKS) || 2,
};

function validateConfig() {
  const requiredEnvVars = ['TELEGRAM_BOT_TOKEN', 'OPENAI_API_KEY'];
  const missing = requiredEnvVars.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

async function shutdown(botService: TelegramBotService) {
  console.log('Shutting down...');
  try {
    await botService.stop();
    console.log('Gracefully stopped bot service');
    process.exit(0);
  } catch (error) {
    console.error('Error during shutdown:', error);
    process.exit(1);
  }
}

async function bootstrap() {
  try {
    // Validate configuration
    validateConfig();

    // Initialize services
    const sessionRepository = new InMemorySessionRepository();
    const stateManager = new StateManager();
    const llmService = new LlmService(llmConfig);

    const messageProcessor = new MessageProcessor(stateManager, llmService, messageProcessorConfig);

    const botService = new TelegramBotService(telegramConfig, sessionRepository, messageProcessor);

    // Set up graceful shutdown
    process.once('SIGINT', () => shutdown(botService));
    process.once('SIGTERM', () => shutdown(botService));

    // Handle uncaught errors
    process.on('uncaughtException', async (error) => {
      console.error('Uncaught exception:', error);
      await shutdown(botService);
    });

    process.on('unhandledRejection', async (reason) => {
      console.error('Unhandled rejection:', reason);
      await shutdown(botService);
    });

    // Start the bot
    await botService.start();
    console.log(`Bot started in ${telegramConfig.environment} mode`);
  } catch (error) {
    console.error('Failed to start the bot:', error);
    process.exit(1);
  }
}

// Start the application
bootstrap();
