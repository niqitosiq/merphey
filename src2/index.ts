import { UserSessionRepositoryImpl } from './domain/repositories/user-session.repository';
import { TelegramBotService } from './infrastructure/telegram/telegram-bot.service';

async function bootstrap() {
  const startTime = Date.now();
  logger.info('Starting application...');

  try {
    // Initialize base services
    const sessionRepository = new UserSessionRepositoryImpl();

    // Initialize bot service with communicator
    const botService = new TelegramBotService(sessionRepository);

    // Start metrics collection
    await startMetricsCollection();

    // Set up graceful shutdown
    await setupGracefulShutdown(botService);

    // Start the bot
    await botService.start();

    const startupTime = Date.now() - startTime;
    metrics.recordMetric('startup_time_ms', startupTime);
    logger.info(`Application started successfully in ${startupTime}ms`);
  } catch (error) {
    logger.error('Failed to start application', { error });
    process.exit(1);
  }
}

// Start the application
bootstrap();
