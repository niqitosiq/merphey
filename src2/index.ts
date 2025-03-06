import { UserSessionRepositoryImpl } from './domain/repositories/user-session.repository';
import { TelegramBotService } from './infrastructure/telegram/telegram-bot.service';

async function bootstrap() {
  const startTime = Date.now();
  console.info('Bootstraping v2')
  try {
    // Initialize base services
    const sessionRepository = new UserSessionRepositoryImpl();

    // Initialize bot service with communicator
    const botService = new TelegramBotService(sessionRepository);

    // Start the bot
    await botService.start();
  } catch (error) {
    process.exit(1);
  }
}

// Start the application
bootstrap();
