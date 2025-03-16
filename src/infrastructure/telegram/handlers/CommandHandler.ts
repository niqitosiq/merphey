import { MentalHealthApplication } from '../../../application/MentalHealthApplication';
import { ConversationState } from '../../../domain/shared/enums';

/**
 * Handler for command messages received from Telegram
 * Processes command messages starting with / and routes them appropriately
 */
export class CommandHandler {
  // Available bot commands
  private readonly availableCommands = ['start', 'help', 'info', 'cancel', 'feedback', 'resources'];

  /**
   * Creates a new command handler
   * @param application - Core application instance
   */
  constructor(private readonly application: MentalHealthApplication) {}

  /**
   * Handles a command message from a user
   * @param userId - The Telegram user ID
   * @param command - The command name (without /)
   * @param args - Command arguments if any
   * @returns Promise<string> - Response message to send to the user
   */
  async handleCommand(userId: string, command: string, args: string[] = []): Promise<string> {
    try {
      // Check if command is valid
      if (!this.availableCommands.includes(command)) {
        return `Unknown command /${command}. Type /help for available commands.`;
      }

      console.log(`Processing command /${command} from user ${userId}`);

      // Route to appropriate command handler
      switch (command) {
        case 'start':
          return await this.handleStartCommand(userId);

        case 'help':
          return await this.handleHelpCommand(userId);

        case 'info':
          return await this.handleInfoCommand(userId);

        case 'cancel':
          return await this.handleCancelCommand(userId);

        // case 'feedback':
        //   return await this.handleFeedbackCommand(userId, args);

        // case 'resources':
        //   return await this.handleResourcesCommand(userId);

        default:
          // This shouldn't happen because we validated the command above
          return `Sorry, the /${command} command is not implemented yet.`;
      }
    } catch (error) {
      console.error(`Error processing command /${command} from user ${userId}:`, error);
      return `Sorry, I encountered an error while processing your /${command} command. Please try again later.`;
    }
  }

  /**
   * Handles the /start command
   * @param userId - The Telegram user ID
   * @returns Promise<string> - Welcome message
   */
  private async handleStartCommand(userId: string): Promise<string> {
    // Create user session if it doesn't exist
    await this.application.startSession(userId);

    return `Welcome to PsychoBot! 🌿\n\n
I'm here to support your mental health journey through therapeutic conversations. I can help with:\n
- Daily check-ins and emotional support
- Developing coping strategies
- Providing therapeutic techniques
- Offering resources when needed\n
Simply start typing to begin our conversation. Your privacy and wellbeing are my priorities.\n
Type /help anytime to see available commands.`;
  }

  /**
   * Handles the /help command
   * @param userId - The Telegram user ID
   * @returns Promise<string> - Help message
   */
  private async handleHelpCommand(userId: string): Promise<string> {
    return `*PsychoBot Help* 📚\n
Available commands:
- /start - Begin or restart a therapy session
- /help - Show this help message
- /info - View your therapy progress and status
- /cancel - End the current conversation flow
- /feedback - Submit feedback (e.g., /feedback Your message here)
- /resources - Get mental health support resources\n
For immediate crisis support, please contact emergency services in your area or text HOME to 741741 to reach Crisis Text Line.`;
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
        return "I don't have any active sessions with you yet. Type /start to begin.";
      }

      // Format session information
      let response = '*Your Therapy Session Info* 📊\n\n';

      // Conversation state
      response += `*Current state*: ${this.formatConversationState(userInfo.conversation.state)}\n\n`;

      // Session statistics
      response += '*Session statistics*:\n';
      response += `- Messages exchanged: ${userInfo.stats.messageCount}\n`;
      response += `- Session duration: ${this.formatDuration(userInfo.stats.sessionDuration)}\n`;

      // Current plan information
      if (userInfo.plan) {
        response += '\n*Current therapeutic plan*:\n';
        response += `- Focus area: ${userInfo.plan.currentVersion?.content}\n`;

        // // Progress highlights
        // if (userInfo.progress && userInfo.progress.insights.length > 0) {
        //   response += '\n*Progress highlights*:\n';
        //   userInfo.progress.insights.slice(0, 3).forEach((insight) => {
        //     response += `- ${insight}\n`;
        //   });
        // }
      }

      response += '\nContinue our conversation anytime by simply typing a message.';

      return response;
    } catch (error) {
      console.error(`Error retrieving user info for ${userId}:`, error);
      return "I'm having trouble retrieving your session information right now. Please try again soon.";
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

      return "I've reset our current conversation flow. You can start a new topic whenever you're ready.";
    } catch (error) {
      console.error(`Error canceling conversation for ${userId}:`, error);
      return "I'm having trouble resetting our conversation right now. Please try again soon.";
    }
  }

  // /**
  //  * Handles the /feedback command
  //  * @param userId - The Telegram user ID
  //  * @param args - Feedback message contents
  //  * @returns Promise<string> - Confirmation message
  //  */
  // private async handleFeedbackCommand(userId: string, args: string[]): Promise<string> {
  //   try {
  //     // Check if feedback content was provided
  //     if (!args || args.length === 0) {
  //       return 'Please include your feedback after the command. For example: /feedback I found our session helpful today.';
  //     }

  //     // Join the args to form the complete feedback message
  //     const feedbackMessage = args.join(' ');

  //     // Store the feedback
  //     await this.application.recordFeedback(userId, feedbackMessage);

  //     return 'Thank you for your feedback! It helps me improve my support for you and others.';
  //   } catch (error) {
  //     console.error(`Error recording feedback from ${userId}:`, error);
  //     return "I'm having trouble processing your feedback right now. Please try again soon.";
  //   }
  // }

  // /**
  //  * Handles the /resources command
  //  * @param userId - The Telegram user ID
  //  * @returns Promise<string> - Resources message
  //  */
  // private async handleResourcesCommand(userId: string): Promise<string> {
  //   // Retrieve relevant resources based on user's history
  //   const resources = await this.application.getRelevantResources(userId);

  //   let response = '*Mental Health Resources* 🌱\n\n';

  //   if (resources && resources.length > 0) {
  //     resources.forEach((resource) => {
  //       response += `*${resource.name}*\n`;
  //       response += `${resource.description}\n`;
  //       response += `Contact: ${resource.contact}\n\n`;
  //     });
  //   } else {
  //     // Default resources if personalized ones are not available
  //     response += '*Crisis Text Line*\n';
  //     response += 'Text HOME to 741741 to connect with a Crisis Counselor\n';
  //     response += 'Available 24/7 for mental health support\n\n';

  //     response += '*National Suicide Prevention Lifeline*\n';
  //     response += 'Call 1-800-273-8255\n';
  //     response += 'Available 24/7 for anyone in suicidal crisis or emotional distress\n\n';

  //     response += "*SAMHSA's National Helpline*\n";
  //     response += 'Call 1-800-662-4357\n';
  //     response +=
  //       'Treatment referral and information service for individuals facing mental health or substance use disorders\n';
  //   }

  //   return response;
  // }

  /**
   * Formats conversation state for display
   * @param state - The conversation state enum value
   * @returns string - Readable state description
   */
  private formatConversationState(state: ConversationState): string {
    switch (state) {
      case ConversationState.INFO_GATHERING:
        return 'Initial Assessment';
      case ConversationState.ACTIVE_GUIDANCE:
        return 'Active Conversation';
      case ConversationState.PLAN_REVISION:
        return 'Plan Review';
      case ConversationState.EMERGENCY_INTERVENTION:
        return 'Support Intervention';
      case ConversationState.SESSION_CLOSING:
        return 'Session Wrap-up';
      default:
        return 'Getting Started';
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
      return `${days} day${days > 1 ? 's' : ''} ${hours % 24} hour${hours % 24 !== 1 ? 's' : ''}`;
    } else if (hours > 0) {
      return `${hours} hour${hours > 1 ? 's' : ''} ${minutes % 60} minute${minutes % 60 !== 1 ? 's' : ''}`;
    } else if (minutes > 0) {
      return `${minutes} minute${minutes > 1 ? 's' : ''} ${seconds % 60} second${seconds % 60 !== 1 ? 's' : ''}`;
    } else {
      return `${seconds} second${seconds !== 1 ? 's' : ''}`;
    }
  }
}
