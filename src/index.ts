import { TelegramBotService } from './infrastructure/telegram/telegram-bot.service';

// Handle process termination gracefully
process.on('SIGINT', () => {
  console.log('SIGINT signal received: closing application');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing application');
  process.exit(0);
});

// Main function to start the application
async function main() {
  try {
    console.log('Starting Psychology Help Telegram Bot...');

    // Initialize and launch the Telegram bot
    const telegramBotService = new TelegramBotService();
    await telegramBotService.launch();

    console.log('Bot is running. Press CTRL+C to stop.');
  } catch (error) {
    console.error('Failed to start the application:', error);
    process.exit(1);
  }
}

// Start the application
main();
