//The Reflect polyfill import should only be added once, and before DI is used:
import "reflect-metadata";
import { container } from 'tsyringe';

import { TelegramBot } from '../infrastructure/telegram/bot/TelegramBot';


// Оригинальный метод resolve
const originalResolve = container.resolve.bind(container);

// Перехватчик resolve
container.resolve = <T>(token: any): T => {
  console.log(`[DI] Resolving: ${token.toString()}`);
  return originalResolve<T>(token);
};


async function bootstrap() {
  try {

    const bot = container.resolve(TelegramBot);
	
	
	bot.bootstrap()

    console.log('PsychoBot is running! 🤖');
  } catch (error) {
    console.error('Failed to start the application:', error);
    process.exit(1);
  }
}

// Start the application
bootstrap();
