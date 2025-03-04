import { Telegraf } from 'telegraf';
import { config } from '../config';
import { ConversationState, UserSession } from '../../domain/entities/user-session';
import { UserSessionRepository } from '../../domain/repositories/user-session.repository';
import { AzureOpenAIService, ConversationStepType } from '../llm/azure-openai.service';

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

  private setupMiddleware(): void {
    this.bot.use(async (ctx, next) => {
      const userId = ctx.from?.id.toString();
      if (userId) {
        // console.log(`Received message from user ${userId}: ${ctx.message?.text}`);
      }
      await next();
    });
  }

  private setupCommands(): void {
    this.bot.command('start', async (ctx) => {
      const userId = ctx.from.id.toString();
      const session = this.sessionRepository.getOrCreateSession(userId);
      session.reset();
      session.state = ConversationState.WAITING_FOR_PROBLEM;
      this.sessionRepository.saveSession(session);

      await ctx.reply(
        'Добро пожаловать в бота психологической помощи! 👋\n\n' +
          'Я здесь, чтобы помочь вам разобраться в психологических проблемах. ' +
          'Пожалуйста, опишите вашу проблему или беспокойство, и я проведу вас через процесс, который поможет получить новое понимание ситуации.',
      );
    });

    this.bot.command('help', async (ctx) => {
      await ctx.reply(
        'Команды бота психологической помощи:\n\n' +
          '/start - Начать новый разговор\n' +
          '/help - Показать это сообщение помощи\n' +
          '/reset - Сбросить текущий разговор\n\n' +
          'Просто опишите вашу проблему или беспокойство, чтобы начать.',
      );
    });

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

  private setupMessageHandlers(): void {
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
          await this.processInitialProblem(ctx, session);
          break;

        case ConversationState.GENERATING_CONVERSATION_PLAN:
          await this.generateConversationPlan(ctx, session);
          break;

        case ConversationState.EXPLORING_QUESTIONS:
          await this.handleQuestionExplorationAnswer(ctx, session, messageText);
          break;

        case ConversationState.GENERATING_ANALYSIS:
          await this.generateFinalAnalysis(ctx, session);
          break;

        default:
          await ctx.reply(
            'Что-то пошло не так. Пожалуйста, попробуйте сбросить разговор командой /reset.',
          );
      }
    });
  }

  private async handleProblemStatement(
    ctx: any,
    session: UserSession,
    problem: string,
  ): Promise<void> {
    session.setProblemStatement(problem);
    await ctx.reply('Спасибо, что поделились. Анализирую вашу проблему...');
    this.sessionRepository.saveSession(session);

    await this.processInitialProblem(ctx, session);
  }

  private async processInitialProblem(ctx: any, session: UserSession): Promise<void> {
    try {
      const analyzedProblem = await this.azureOpenAIService.processInitialMessage(
        session.problemStatement,
      );
      session.setAnalyzedProblem(analyzedProblem);
      this.sessionRepository.saveSession(session);

      await ctx.reply('Анализ проблемы завершен. Создаю план нашей беседы...');
      await this.generateConversationPlan(ctx, session);
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

  private async generateConversationPlan(ctx: any, session: UserSession): Promise<void> {
    try {
      const conversationPlan = await this.azureOpenAIService.generateConversationPlan(
        session.analyzedProblem || session.problemStatement,
      );

      console.log(conversationPlan);

      session.setConversationPlan(conversationPlan);
      this.sessionRepository.saveSession(session);

      // Show a summary of the conversation plan
      // const mainTopics = conversationPlan.mainTopics
      //   .map((topic, index) => `${index + 1}. ${topic.text}`)
      //   .join('\n');

      // await ctx.reply(
      //   `Я подготовил план нашей беседы с основными темами для обсуждения:\n\n${mainTopics}\n\nДавайте начнем обсуждение.`,
      // );

      // Start exploring questions
      await this.exploreCurrentQuestion(ctx, session);
    } catch (error) {
      console.error('Error generating conversation plan:', error);
      await ctx.reply(
        'Произошла ошибка при создании плана беседы. Не могли бы вы попробовать еще раз или сбросить разговор командой /reset?',
      );
      session.reset();
      session.state = ConversationState.WAITING_FOR_PROBLEM;
      this.sessionRepository.saveSession(session);
    }
  }

  private async exploreCurrentQuestion(ctx: any, session: UserSession): Promise<void> {
    try {
      const result = await this.azureOpenAIService.exploreQuestions(
        session.problemStatement,
        session.conversationPlan!,
        session.previousAnswers,
        session.conversationHistory,
        session.questionProgress,
      );

      // Update session with exploration results
      session.updateQuestionProgress(result.questionsProgress);
      session.setSuggestedNextQuestions(result.suggestedNextQuestions);

      // Send the response to the user
      await ctx.reply(result.response);

      // Add to conversation history
      session.conversationHistory.push({ role: 'assistant', content: result.response });

      // If there are no more questions to explore, move to final analysis
      if (!result.shouldContinue) {
        await ctx.reply('Мы обсудили все необходимые темы. Готовлю финальный анализ...');
        await this.generateFinalAnalysis(ctx, session);
      }

      this.sessionRepository.saveSession(session);
    } catch (error) {
      console.error('Error exploring questions:', error);
      await ctx.reply(
        'Произошла ошибка при обсуждении вопросов. Попробуйте начать новую сессию с помощью команды /reset.',
      );
      session.reset();
      this.sessionRepository.saveSession(session);
    }
  }

  private async handleQuestionExplorationAnswer(
    ctx: any,
    session: UserSession,
    answer: string,
  ): Promise<void> {
    // Add the user's answer to conversation history
    session.conversationHistory.push({ role: 'user', content: answer });

    // Update the answer in the session
    if (session.suggestedNextQuestions.length > 0) {
      session.previousAnswers[session.suggestedNextQuestions[0].id] = answer;
      session.questionsAndAnswers.push({
        question: session.suggestedNextQuestions[0].text,
        answer,
      });
    }

    this.sessionRepository.saveSession(session);

    // Continue exploration if the conversation is not completed
    if (!session.conversationCompleted) {
      await this.exploreCurrentQuestion(ctx, session);
    }
  }

  private async generateFinalAnalysis(ctx: any, session: UserSession): Promise<void> {
    try {
      const finalAnalysis = await this.azureOpenAIService.generateFinalAnalysis(
        session.problemStatement,
        session.questionsAndAnswers,
      );

      session.setFinalAnalysis(finalAnalysis);
      this.sessionRepository.saveSession(session);

      await ctx.reply(finalAnalysis);

      await ctx.reply(
        'Надеюсь, этот анализ был полезен для вас. Если у вас есть другие вопросы или вы хотите обсудить что-то еще, ' +
          'вы можете начать новый разговор в любое время, используя команду /start для начала новой сессии.',
      );

      session.reset();
      session.state = ConversationState.WAITING_FOR_PROBLEM;
      this.sessionRepository.saveSession(session);
    } catch (error) {
      console.error('Error generating final analysis:', error);
      await ctx.reply(
        'Произошла ошибка при генерации анализа. Не могли бы вы попробовать сбросить разговор командой /reset?',
      );
      session.reset();
      this.sessionRepository.saveSession(session);
    }
  }

  async launch(): Promise<void> {
    try {
      await this.bot.launch();
      console.log('Telegram bot is running...');
    } catch (error) {
      console.error('Failed to launch Telegram bot:', error);
      throw error;
    }
  }

  stop(): void {
    this.bot.stop();
    console.log('Telegram bot has been stopped.');
  }
}
