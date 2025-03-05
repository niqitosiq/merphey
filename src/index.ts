import { TelegramBotService } from './infrastructure/telegram/telegram-bot.service';
import { UserSessionRepositoryImpl } from './domain/repositories/user-session.repository';
import { Logger } from './utils/logger';
import { MetricsService } from './utils/metrics';
import { ErrorBoundary, ErrorSeverity, ApplicationError } from './utils/error-boundary';
import { PsychologistService } from './domain/services/psychologist.service';
import { CommunicatorService } from './domain/services/communicator.service';

const logger = Logger.getInstance();
const metrics = MetricsService.getInstance();

async function checkServices(): Promise<void> {
  const services = [{ name: 'UserSessionRepository', instance: new UserSessionRepositoryImpl() }];

  for (const service of services) {
    try {
      if (!service.instance) {
        throw new ApplicationError(
          `Failed to initialize ${service.name}`,
          'SERVICE_INIT_ERROR',
          ErrorSeverity.CRITICAL,
        );
      }
      logger.info(`${service.name} initialized successfully`);
    } catch (error) {
      logger.error(`Failed to initialize ${service.name}`, { error });
      throw error;
    }
  }
}

async function startMetricsCollection(): Promise<void> {
  setInterval(() => {
    const usedHeap = process.memoryUsage().heapUsed / 1024 / 1024;
    metrics.recordMetric('memory_usage_mb', usedHeap);
  }, 60000);
}

async function setupGracefulShutdown(botService: TelegramBotService): Promise<void> {
  async function shutdown(signal: string) {
    logger.info(`Received ${signal}, starting graceful shutdown...`);

    try {
      await botService.stop();
      logger.info('Bot service stopped successfully');

      const errorSummary = ErrorBoundary.getErrorSummary();
      logger.info('Final error summary', errorSummary);

      const metricsSummary = metrics.getSummary();
      logger.info('Final metrics summary', metricsSummary);

      process.exit(0);
    } catch (error) {
      logger.error('Error during shutdown', { error });
      process.exit(1);
    }
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception', { error });
    shutdown('uncaughtException');
  });

  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled rejection', { reason });
    shutdown('unhandledRejection');
  });
}

async function bootstrap() {
  const startTime = Date.now();
  logger.info('Starting application...');

  try {
    // Initialize base services
    const sessionRepository = new UserSessionRepositoryImpl();

    // Initialize domain services with dependencies
    const psychologistService = new PsychologistService(sessionRepository);
    const communicatorService = new CommunicatorService(psychologistService);

    // Initialize bot service with communicator
    const botService = new TelegramBotService(communicatorService, sessionRepository);

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
