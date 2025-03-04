import { AzureOpenAIService } from '../../infrastructure/llm/azure-openai.service';
import { UserSessionRepository } from '../repositories/user-session.repository';
import { UserSession, UserSessionFactory } from '../entities/user-session';
import { ConversationPlan, QuestionNode } from '../entities/conversation';
import { config } from '../../infrastructure/config';
import { Logger } from '../../utils/logger';

export class ConversationService {
  private readonly logger = Logger.getInstance();

  constructor(
    private readonly llmService: AzureOpenAIService,
    private readonly sessionRepository: UserSessionRepository,
  ) {}

  async startConversation(userId: string, initialProblem: string): Promise<UserSession> {
    this.logger.info('Starting new conversation', { userId, initialProblem });

    // Create new session
    const session = await this.sessionRepository.create({
      userId,
      initialProblem,
    });

    try {
      // Analyze the initial problem
      this.logger.debug('Analyzing initial problem', { userId });
      const analyzedProblem = await this.llmService.processInitialMessage(initialProblem);
      session.analyzedProblem = analyzedProblem;

      // Generate conversation plan
      this.logger.debug('Generating conversation plan', { userId });
      const conversationPlan = await this.llmService.generateConversationPlan(analyzedProblem);
      session.conversationPlan = conversationPlan;

      // Update session
      const updatedSession = await this.sessionRepository.update(session);
      this.logger.info('Conversation started successfully', { userId });
      return updatedSession;
    } catch (error) {
      this.logger.error('Failed to start conversation', { userId, error });
      throw error;
    }
  }

  async processUserResponse(
    userId: string,
    message: string,
  ): Promise<{ response: string; isComplete: boolean }> {
    this.logger.debug('Processing user response', { userId, messageLength: message.length });

    const session = await this.sessionRepository.findActiveByUserId(userId);
    if (!session) {
      this.logger.warn('No active session found', { userId });
      throw new Error('No active session found');
    }

    try {
      // Get current question and explore it
      const currentQuestion = this.getCurrentQuestion(session);
      if (!currentQuestion) {
        this.logger.info('No more questions, generating final analysis', { userId });
        const analysis = await this.llmService.generateFinalAnalysis(
          session.initialProblem!,
          this.getQuestionsAndAnswers(session),
        );

        session.isComplete = true;
        await this.sessionRepository.update(session);

        return { response: analysis, isComplete: true };
      }

      this.logger.debug('Processing current question', {
        userId,
        questionId: currentQuestion.id,
        exchanges: session.currentQuestionExchanges,
      });

      // Process the response for the current question
      const result = await this.llmService.exploreQuestion(
        currentQuestion,
        session.initialProblem!,
        session.previousAnswers,
        session.conversationHistory,
        session.currentQuestionExchanges,
      );

      // Update session with the new response
      session.conversationHistory.push(
        { role: 'user', content: message },
        { role: 'assistant', content: result.response },
      );
      session.currentQuestionExchanges++;

      if (result.isComplete) {
        this.logger.debug('Question completed', {
          userId,
          questionId: currentQuestion.id,
          reason: result.completionReason,
        });
        session.previousAnswers[currentQuestion.id] = message;
        this.moveToNextQuestion(session);
      }

      await this.sessionRepository.update(session);

      return {
        response: result.response,
        isComplete: session.isComplete,
      };
    } catch (error) {
      this.logger.error('Failed to process user response', { userId, error });
      throw error;
    }
  }

  private getCurrentQuestion(session: UserSession): QuestionNode | null {
    if (!session.conversationPlan || !session.currentQuestionId) {
      const firstQuestion = session.conversationPlan?.mainTopics[0];
      if (firstQuestion) {
        session.currentQuestionId = firstQuestion.id;
        return firstQuestion;
      }
      return null;
    }

    return this.findQuestionById(session.conversationPlan.mainTopics, session.currentQuestionId);
  }

  private findQuestionById(questions: QuestionNode[], id: string): QuestionNode | null {
    for (const question of questions) {
      if (question.id === id) return question;
      if (question.subQuestions) {
        const found = this.findQuestionById(question.subQuestions, id);
        if (found) return found;
      }
    }
    return null;
  }

  private moveToNextQuestion(session: UserSession): void {
    if (!session.conversationPlan) return;

    const currentQuestion = this.getCurrentQuestion(session);
    if (!currentQuestion) return;

    // First check subquestions
    if (currentQuestion.subQuestions?.length) {
      const unansweredSubQuestion = currentQuestion.subQuestions.find(
        (q) => !session.previousAnswers[q.id],
      );
      if (unansweredSubQuestion) {
        session.currentQuestionId = unansweredSubQuestion.id;
        session.currentQuestionExchanges = 0;
        return;
      }
    }

    // If no subquestions or all answered, move to next main question
    const currentMainIndex = session.conversationPlan.mainTopics.findIndex(
      (q) => q.id === currentQuestion.id,
    );
    
    if (currentMainIndex >= 0 && currentMainIndex < session.conversationPlan.mainTopics.length - 1) {
      session.currentQuestionId = session.conversationPlan.mainTopics[currentMainIndex + 1].id;
      session.currentQuestionExchanges = 0;
    } else {
      session.isComplete = true;
    }
  }

  private getQuestionsAndAnswers(session: UserSession): Array<{ question: string; answer: string }> {
    return Object.entries(session.previousAnswers).map(([id, answer]) => {
      const question = this.findQuestionById(session.conversationPlan!.mainTopics, id);
      return {
        question: question?.text || 'Unknown question',
        answer,
      };
    });
  }
}