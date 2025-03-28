import { UserRepository } from 'src/infrastructure/persistence/postgres/UserRepository';
import { MentalHealthApplication } from '../../../application/MentalHealthApplication';
import { ConversationState } from '@prisma/client';
import { scoped, Lifecycle, injectable, autoInjectable } from 'tsyringe';

/**
 * Handler for command messages received from Telegram
 * Processes command messages starting with / and routes them appropriately
 */

@scoped(Lifecycle.ContainerScoped)
@injectable()
@autoInjectable()
export class CommandHandler {
  // Available bot commands
  private readonly availableCommands = [
    'start',
    'help',
    'info',
    'cancel',
    'feedback',
    'resources',
    'buy',
    'getExtraCreditsForCoolGuys',
  ];

  /**
   * Creates a new command handler
   * @param application - Core application instance
   */
  constructor(
    private readonly application: MentalHealthApplication,
    private readonly userRepository: UserRepository,
  ) {}

  /**
   * Handles a command message from a user
   * @param userId - The Telegram user ID
   * @param command - The command name (without /)
   * @returns Promise<string> - Response message to send to the user
   */
  async handleCommand(userId: string, command: string): Promise<string> {
    try {
      // Check if command is valid
      if (!this.availableCommands.includes(command)) {
        return `Неизвестная команда /${command}. Напишите /help чтобы увидеть доступные команды.`;
      }

      console.log(`Processing command /${command} from user ${userId}`);

      // Route to appropriate command handler
      switch (command) {
        case 'start':
          return await this.handleStartCommand(userId);

        case 'help':
          return await this.handleHelpCommand();

        case 'info':
          return await this.handleInfoCommand(userId);

        case 'cancel':
          return await this.handleCancelCommand(userId);

        case 'getExtraCreditsForCoolGuys':
          return await this.getExtraCreditsForCoolGuys(userId);

        default:
          return `Извините, команда /${command} пока не реализована.`;
      }
    } catch (error) {
      console.error(`Error processing command /${command} from user ${userId}:`, error);
      return `Извините, произошла ошибка при обработке команды /${command}. Пожалуйста, попробуйте позже.`;
    }
  }

  /**
   * Handles the /getExtraCreditsForCoolGuys command
   * @param userId - The Telegram user ID
   * @returns Promise<string> - Confirmation message
   */
  private async getExtraCreditsForCoolGuys(userId: string): Promise<string> {
    try {
      // Add extra credits to user's account
      await this.userRepository.incrementBalance(userId, 1);
      return 'Вы получили 1 дополнительный кредит! 🎉';
    } catch (error) {
      console.error(`Error adding extra credits for ${userId}:`, error);
      return 'Не удалось добавить кредиты. Пожалуйста, попробуйте позже.';
    }
  }

  /**
   * Handles the /start command
   * @param userId - The Telegram user ID
   * @returns Promise<string> - Welcome message
   */
  private async handleStartCommand(userId: string): Promise<string> {
    // Create user session if it doesn't exist
    const info = await this.application.getUserInfo(userId);
    // const session = await this.application.startSession(userId);

    // Get user's current balance and active session info
    const activeSession = info?.conversation ? 'активная' : 'нет активных';

    return `Добро пожаловать в PsychoBot! 🌿\n\n
Я здесь, чтобы поддержать ваше психическое здоровье через терапевтические беседы. Я могу помочь с:\n
- Ежедневными проверками и эмоциональной поддержкой
- Развитием стратегий совладания
- Предоставлением терапевтических техник
- Предложением ресурсов при необходимости\n
💫 Ваш текущий баланс: ${info?.user?.balance} кредит(ов)
🕒 Статус сессии: ${activeSession}\n
📝 Каждая сессия длится 30 минут и стоит 1 кредит
⭐️ Используйте команду /buy чтобы пополнить баланс (150 звёзд = 1 кредит)\n
Просто начните печатать, чтобы начать нашу беседу. Ваша конфиденциальность и благополучие - мои приоритеты.\n
Напишите /help в любое время, чтобы увидеть доступные команды.`;
  }

  /**
   * Handles the /help command
   * @returns Promise<string> - Help message
   */
  private async handleHelpCommand(): Promise<string> {
    return `*Помощь PsychoBot* 📚\n
Доступные команды:
- /start - Начать или перезапустить сессию терапии
- /help - Показать это сообщение помощи
- /info - Посмотреть свой прогресс и статус терапии
- /buy - Пополнить баланс кредитов (150 звёзд = 1 кредит)
- /cancel - Завершить текущий поток разговора
- /feedback - Отправить отзыв (например, /feedback Ваше сообщение)
- /resources - Получить ресурсы поддержки психического здоровья\n
Для немедленной кризисной поддержки, пожалуйста, обратитесь в службу экстренной помощи в вашем регионе.`;
  }

  /**
   * Handles the /info command
   * @param userId - The Telegram user ID
   * @returns Promise<string> - Info message about user's current status
   */
  private async handleInfoCommand(userId: string): Promise<string> {
    try {
      // Retrieve user's conversation and plan information
      const userInfo = await this.application.getUserInfo(userId);

      if (!userInfo || !userInfo.conversation) {
        return 'У меня пока нет активных сессий с вами. Напишите /start чтобы начать.';
      }

      // Format session information
      let response = '*Информация о вашей терапевтической сессии* 📊\n\n';

      // Conversation state
      // response += `*Текущее состояние*: ${this.formatConversationState(userInfo.conversation.state)}\n\n`;

      // Session statistics
      response += '*Статистика сессии*:\n';
      response += `- Обмен сообщениями: ${userInfo.stats.messageCount}\n`;
      response += `- Продолжительность сессии: ${this.formatDuration(userInfo.stats.sessionDuration)}\n`;

      // Current plan information
      if (userInfo.plan) {
        response += '\n*Текущий терапевтический план*:\n';
        response += `- Область фокуса: ${userInfo.plan.currentVersion?.content.focus}\n`;
      }

      response += `*Информация о пользователе*:\n`;
      response += `- Баланс: ${userInfo.user?.balance} кредит(ов)\n`;

      response += '\nПродолжите нашу беседу в любое время, просто написав сообщение.';

      return response;
    } catch (error) {
      console.error(`Error retrieving user info for ${userId}:`, error);
      return 'У меня возникли проблемы с получением информации о вашей сессии. Пожалуйста, попробуйте позже.';
    }
  }

  /**
   * Handles the /cancel command
   * @param userId - The Telegram user ID
   * @returns Promise<string> - Confirmation message
   */
  private async handleCancelCommand(userId: string): Promise<string> {
    try {
      // Reset current conversation state
      await this.application.resetConversationState(userId);

      return 'Я сбросил текущий поток разговора. Вы можете начать новую тему, когда будете готовы.';
    } catch (error) {
      console.error(`Error canceling conversation for ${userId}:`, error);
      return 'У меня возникли проблемы со сбросом нашего разговора. Пожалуйста, попробуйте позже.';
    }
  }

  /**
   * Formats conversation state for display
   * @param state - The conversation state enum value
   * @returns string - Readable state description
   */
  private formatConversationState(state: ConversationState): string {
    switch (state) {
      case ConversationState.INFO_GATHERING:
        return 'Начальная оценка';
      case ConversationState.ACTIVE_GUIDANCE:
        return 'Активный разговор';
      case ConversationState.PLAN_REVISION:
        return 'Пересмотр плана';
      case ConversationState.EMERGENCY_INTERVENTION:
        return 'Экстренное вмешательство';
      case ConversationState.SESSION_CLOSING:
        return 'Завершение сессии';
      default:
        return 'Начало работы';
    }
  }

  /**
   * Formats duration in milliseconds to readable format
   * @param durationMs - Duration in milliseconds
   * @returns string - Formatted duration string
   */
  private formatDuration(durationMs: number): string {
    const seconds = Math.floor(durationMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
      return `${days} ${this.pluralize(days, 'день', 'дня', 'дней')} ${hours % 24} ${this.pluralize(hours % 24, 'час', 'часа', 'часов')}`;
    } else if (hours > 0) {
      return `${hours} ${this.pluralize(hours, 'час', 'часа', 'часов')} ${minutes % 60} ${this.pluralize(minutes % 60, 'минута', 'минуты', 'минут')}`;
    } else if (minutes > 0) {
      return `${minutes} ${this.pluralize(minutes, 'минута', 'минуты', 'минут')} ${seconds % 60} ${this.pluralize(seconds % 60, 'секунда', 'секунды', 'секунд')}`;
    } else {
      return `${seconds} ${this.pluralize(seconds, 'секунда', 'секунды', 'секунд')}`;
    }
  }

  /**
   * Helper function for Russian pluralization
   */
  private pluralize(number: number, one: string, few: string, many: string): string {
    const mod10 = number % 10;
    const mod100 = number % 100;

    if (mod10 === 1 && mod100 !== 11) {
      return one;
    }
    if ([2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100)) {
      return few;
    }
    return many;
  }
}
