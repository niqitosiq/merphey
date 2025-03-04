import { Telegraf, session } from 'telegraf';
import { config } from '../config';
import { ConversationState, UserSession } from '../../domain/entities/user-session';
import { UserSessionRepository } from '../../domain/repositories/user-session.repository';
import { AzureOpenAIService } from '../llm/azure-openai.service';

export class TelegramBotService {
  private bot: Telegraf;
  private sessionRepository: UserSessionRepository;
  private azureOpenAIService: AzureOpenAIService;

  constructor() {
    this.bot = new Telegraf(config.telegramBot.token);
    this.sessionRepository = new UserSessionRepository();
    this.azureOpenAIService = new AzureOpenAIService();

    this.setupMiddleware();
    this.setupCommands();
    this.setupMessageHandlers();
  }

  /**
   * Set up middleware for the bot
   */
  private setupMiddleware(): void {
    // Add middleware to log incoming messages
    this.bot.use(async (ctx, next) => {
      const userId = ctx.from?.id.toString();
      if (userId) {
        // console.log(`Received message from user ${userId}: ${ctx.message?.text}`);
      }
      await next();
    });
  }

  /**
   * Set up command handlers
   */
  private setupCommands(): void {
    // Start command to initiate the conversation
    this.bot.command('start', async (ctx) => {
      const userId = ctx.from.id.toString();
      const session = this.sessionRepository.getOrCreateSession(userId);
      session.state = ConversationState.WAITING_FOR_PROBLEM;
      this.sessionRepository.saveSession(session);

      await ctx.reply(
        'Welcome to the Psychology Help Bot! 👋\n\n' +
          "I'm here to help you understand and work through psychological challenges. " +
          "Please describe your problem or concern, and I'll guide you through a process to gain insights.",
      );
    });

    // Help command to show available commands
    this.bot.command('help', async (ctx) => {
      await ctx.reply(
        'Psychology Help Bot Commands:\n\n' +
          '/start - Begin a new conversation\n' +
          '/help - Show this help message\n' +
          '/reset - Reset your current conversation\n\n' +
          'Simply type your problem or concern to begin.',
      );
    });

    // Reset command to clear the current conversation
    this.bot.command('reset', async (ctx) => {
      const userId = ctx.from.id.toString();
      const session = this.sessionRepository.getOrCreateSession(userId);
      session.reset();
      session.state = ConversationState.WAITING_FOR_PROBLEM;
      this.sessionRepository.saveSession(session);

      await ctx.reply(
        "Your conversation has been reset. You can share a new concern whenever you're ready.",
      );
    });
  }

  /**
   * Set up message handlers
   */
  private setupMessageHandlers(): void {
    // Handle text messages based on the conversation state
    this.bot.on('text', async (ctx) => {
      const userId = ctx.from.id.toString();
      const messageText = ctx.message.text;
      const session = this.sessionRepository.getOrCreateSession(userId);

      switch (session.state) {
        case ConversationState.IDLE:
        case ConversationState.WAITING_FOR_PROBLEM:
          await this.handleProblemStatement(ctx, session, messageText);
          break;

        case ConversationState.PROCESSING_PROBLEM:
          await ctx.reply("I'm still processing your previous message. Please wait a moment...");
          break;

        case ConversationState.ASKING_QUESTIONS:
          await this.handleQuestionAnswer(ctx, session, messageText);
          break;

        case ConversationState.GENERATING_ANALYSIS:
          await ctx.reply(
            "I'm generating an analysis based on your responses. Please wait a moment...",
          );
          break;

        default:
          await ctx.reply(
            'Something went wrong. Please try resetting the conversation with /reset command.',
          );
      }
    });
  }

  /**
   * Handle receiving a problem statement from the user
   */
  private async handleProblemStatement(
    ctx: any,
    session: UserSession,
    problem: string,
  ): Promise<void> {
    await ctx.reply(
      "Thank you for sharing. I'm analyzing your message to better understand how to help you...",
    );

    // Set the problem statement and update state
    session.setProblemStatement(problem);
    this.sessionRepository.saveSession(session);

    try {
      // Process the initial message to get an analyzed problem
      const analyzedProblem = await this.azureOpenAIService.processInitialMessage(problem);
      session.setAnalyzedProblem(analyzedProblem);

      // Generate questions based on the analyzed problem
      const questions = await this.azureOpenAIService.generateQuestions(analyzedProblem);
      session.setQuestions(questions);
      this.sessionRepository.saveSession(session);

      // Send the first question to the user
      const firstQuestion = session.getCurrentQuestion();
      if (firstQuestion) {
        await ctx.reply(
          "Based on your message, I'd like to explore some aspects more deeply. " +
            'Please respond to each question to help me understand better:\n\n' +
            firstQuestion,
        );
      } else {
        await ctx.reply(
          "I couldn't generate questions based on your input. Could you try explaining your situation again?",
        );
        session.reset();
        session.state = ConversationState.WAITING_FOR_PROBLEM;
        this.sessionRepository.saveSession(session);
      }
    } catch (error) {
      console.error('Error processing message:', error);
      await ctx.reply(
        'I encountered an error while processing your message. Could you try again or reset the conversation with /reset?',
      );
      session.reset();
      session.state = ConversationState.WAITING_FOR_PROBLEM;
      this.sessionRepository.saveSession(session);
    }
  }

  /**
   * Handle receiving an answer to a question from the user
   */
  private async handleQuestionAnswer(
    ctx: any,
    session: UserSession,
    answer: string,
  ): Promise<void> {
    // Add the answer to the current question
    session.addAnswer(answer);
    this.sessionRepository.saveSession(session);

    // Check if there are more questions or if we should generate the final analysis
    const nextQuestion = session.getCurrentQuestion();

    if (nextQuestion) {
      // If there's another question, send it to the user
      await ctx.reply(nextQuestion);
    } else {
      // If we've gone through all questions, generate the final analysis
      await ctx.reply(
        "Thank you for your responses. I'm now preparing a thoughtful analysis based on our conversation...",
      );

      try {
        const finalAnalysis = await this.azureOpenAIService.generateFinalAnalysis(
          session.problemStatement,
          session.questionsAndAnswers,
        );

        session.setFinalAnalysis(finalAnalysis);
        this.sessionRepository.saveSession(session);

        await ctx.reply(finalAnalysis);
        await ctx.reply(
          'I hope this guidance is helpful. If you have another concern or would like to discuss something else, ' +
            'you can start a new conversation at any time by typing your message or using /reset to clear the current session.',
        );
      } catch (error) {
        console.error('Error generating final analysis:', error);
        await ctx.reply(
          'I encountered an error while generating your analysis. Could you try resetting the conversation with /reset?',
        );
        session.reset();
        this.sessionRepository.saveSession(session);
      }
    }
  }

  /**
   * Launch the bot
   */
  async launch(): Promise<void> {
    try {
      await this.bot.launch();
      console.log('Telegram bot is running...');
    } catch (error) {
      console.error('Failed to launch Telegram bot:', error);
      throw error;
    }
  }

  /**
   * Stop the bot
   */
  stop(): void {
    this.bot.stop();
    console.log('Telegram bot has been stopped.');
  }
}
