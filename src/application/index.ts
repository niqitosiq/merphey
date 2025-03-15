import 'dotenv/config';
import {
  LLMGateway,
  LLMGatewayConfig,
} from '../infrastructure/llm-integration/llm-gateway.adapter';
import { TelegramBotAdapter } from '../infrastructure/telegram/telegram-bot.adapter';
import { MessageProcessor } from './services/message-processing.service';
import { RiskAssessor } from '../domain/risk-management/services/risk-assessment.service';
import { ContextMonitor } from '../domain/context-analysis/services/context-monitor.service';
import { UserAggregate } from '../domain/user-interaction/aggregates/user.aggregate';
import { TherapeuticPlanAggregate } from '../domain/plan-management/aggregates/therapeutic-plan.aggregate';
import { LLMContextAnalyzer } from '../infrastructure/llm-integration/analyzers/llm-context-analyzer';
import { ConversationState } from '../domain/user-interaction/value-objects/conversation-state.value-object';
import { UserRepository } from '@domain/user-interaction/repositories/user.repository';

const llmConfig: LLMGatewayConfig = {
  providers: {
    openrouter: {
      apiKey: process.env.OPENROUTER_API_KEY || '',
      lowTierModel: 'gpt-3.5-turbo',
      highTierModel: 'gpt-4',
    },
  },
  retryOptions: {
    maxRetries: 3,
    initialDelayMs: 1000,
    backoffFactor: 2,
  },
  circuitBreakerOptions: {
    failureThreshold: 5,
    resetTimeoutMs: 60000,
  },
};

const telegramConfig = {
  token: process.env.TELEGRAM_BOT_TOKEN || '',
  webhookUrl: process.env.WEBHOOK_URL,
  isDevelopment: process.env.NODE_ENV !== 'production',
  secretHash: process.env.WEBHOOK_SECRET || '',
  rateLimitPerMinute: 20,
};

async function bootstrap() {
  try {
    const userRepository = new UserRepository();

    const llmGateway = new LLMGateway(llmConfig);

    const contextAnalyzer = new LLMContextAnalyzer(llmGateway);

    const riskAssessor = new RiskAssessor(llmGateway);
    const contextMonitor = new ContextMonitor(contextAnalyzer);

    const messageProcessor = new MessageProcessor(riskAssessor, contextMonitor, llmGateway);

    const bot = new TelegramBotAdapter(telegramConfig, messageProcessor, userRepository);

    await bot.start();

    process.on('SIGTERM', async () => {
      console.log('Received SIGTERM signal. Shutting down...');
      await bot.stop();
      process.exit(0);
    });

    process.on('SIGINT', async () => {
      console.log('Received SIGINT signal. Shutting down...');
      await bot.stop();
      process.exit(0);
    });

    console.log('Therapeutic Bot started successfully');
  } catch (error) {
    console.error('Failed to start the application:', error);
    process.exit(1);
  }
}

bootstrap();
