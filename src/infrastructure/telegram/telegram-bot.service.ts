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
        'Добро пожаловать в бота психологической помощи! 👋\n\n' +
          'Я здесь, чтобы помочь вам разобраться в психологических проблемах. ' +
          'Пожалуйста, опишите вашу проблему или беспокойство, и я проведу вас через процесс, который поможет получить новое понимание ситуации.',
      );
    });

    // Help command to show available commands
    this.bot.command('help', async (ctx) => {
      await ctx.reply(
        'Команды бота психологической помощи:\n\n' +
          '/start - Начать новый разговор\n' +
          '/help - Показать это сообщение помощи\n' +
          '/reset - Сбросить текущий разговор\n\n' +
          'Просто опишите вашу проблему или беспокойство, чтобы начать.',
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
        'Ваш разговор был сброшен. Вы можете поделиться новой проблемой, когда будете готовы.',
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
          await ctx.reply(
            'Я все еще обрабатываю ваше предыдущее сообщение. Пожалуйста, подождите немного...',
          );
          break;

        case ConversationState.ASKING_QUESTIONS:
          await this.handleQuestionAnswer(ctx, session, messageText);
          break;

        case ConversationState.GENERATING_ANALYSIS:
          await ctx.reply(
            'Я формирую анализ на основе ваших ответов. Пожалуйста, подождите немного...',
          );
          break;

        default:
          await ctx.reply(
            'Что-то пошло не так. Пожалуйста, попробуйте сбросить разговор командой /reset.',
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
      'Спасибо, что поделились. Я анализирую ваше сообщение, чтобы лучше понять, как помочь вам...',
    );

    console.log('problem', problem);

    // Set the problem statement and update state
    session.setProblemStatement(problem);
    this.sessionRepository.saveSession(session);

    try {
      // Process the initial message to get an analyzed problem
      const analyzedProblem = await this.azureOpenAIService.processInitialMessage(problem);
      session.setAnalyzedProblem(analyzedProblem);

      // Generate questions based on the analyzed problem
      const { questions, points } = await this.azureOpenAIService.generateQuestions(
        analyzedProblem,
      );
      session.setQuestions(questions);
      session.setPoints(points);
      this.sessionRepository.saveSession(session);

      // Send the first question to the user
      const firstQuestion = session.getCurrentQuestion();
      if (firstQuestion) {
        await ctx.reply(
          'На основе вашего сообщения я хотел бы глубже изучить некоторые аспекты. ' +
            'Пожалуйста, ответьте на каждый вопрос, чтобы я мог лучше понять ситуацию:\n\n' +
            firstQuestion,
        );
      } else {
        await ctx.reply(
          'Мне не удалось сгенерировать вопросы на основе вашего описания. Не могли бы вы попробовать объяснить ситуацию иначе?',
        );
        session.reset();
        session.state = ConversationState.WAITING_FOR_PROBLEM;
        this.sessionRepository.saveSession(session);
      }
    } catch (error) {
      console.error('Error processing message:', error);
      await ctx.reply(
        'Произошла ошибка при обработке вашего сообщения. Не могли бы вы попробовать еще раз или сбросить разговор командой /reset?',
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
      console.log('Next question:', nextQuestion);
    } else {
      await ctx.reply(session.getPoints());
      console.log('Points:', session.getPoints());
      // If we've gone through all questions, generate the final analysis
      await ctx.reply(
        'Спасибо за ваши ответы. Сейчас я подготовлю тщательный анализ на основе нашего разговора...',
      );

      try {
        const finalAnalysis = await this.azureOpenAIService.generateFinalAnalysis(
          session.problemStatement,
          session.questionsAndAnswers,
        );

        session.setFinalAnalysis(finalAnalysis);
        this.sessionRepository.saveSession(session);

        await ctx.reply(finalAnalysis);
        console.log('Final Analysis:', finalAnalysis);
        await ctx.reply(
          'Надеюсь, этот анализ был полезен для вас. Если у вас есть другие вопросы или вы хотите обсудить что-то еще, ' +
            'вы можете начать новый разговор в любое время, просто написав сообщение или использовав команду /reset для очистки текущей сессии.',
        );
      } catch (error) {
        console.error('Error generating final analysis:', error);
        await ctx.reply(
          'Произошла ошибка при генерации анализа. Не могли бы вы попробовать сбросить разговор командой /reset?',
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
