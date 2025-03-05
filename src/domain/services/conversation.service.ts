import { UserSessionRepository } from '../repositories/user-session.repository';
import { UserSession, UserSessionFactory } from '../entities/user-session';
import { ConversationPlan, QuestionNode } from '../entities/conversation';
import { Logger } from '../../utils/logger';
import { analyzeStep, makeSuggestionOrAsk } from '../../infrastructure/llm/conversation-processors';

export class ConversationService {
  private readonly logger = Logger.getInstance();

  constructor(private readonly sessionRepository: UserSessionRepository) {}

  async startConversation(userId: string, initialProblem: string): Promise<UserSession> {
    this.logger.info('Starting new conversation', { userId, initialProblem });

    // Create new session
    const session = await this.sessionRepository.create({
      userId,
    });

    try {
      // Analyze the initial problem
      this.logger.debug('Analyzing initial problem', { userId });
      const analyzedProblem = await analyzeStep({
        conversationHistory: [{ role: 'user', content: initialProblem }],
        currentQuestion: { text: initialProblem, id: 'initial' }
      });

      // Get response based on analysis
      const response = await makeSuggestionOrAsk({
        conversationHistory: [{ role: 'user', content: initialProblem }],
        currentQuestion: { text: initialProblem, id: 'initial' }
      }, analyzedProblem);

      // Update session
      session.currentQuestion = { text: response.response, id: 'current' };
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
      // Update conversation history
      session.conversationHistory.push({ role: 'user', content: message });

      // Get analysis of the current state
      const analysis = await analyzeStep({
        conversationHistory: session.conversationHistory,
        currentQuestion: session.currentQuestion,
        initialProblem: message
      });

      // Process the response
      const result = await makeSuggestionOrAsk({
        conversationHistory: session.conversationHistory,
        currentQuestion: session.currentQuestion,
        initialProblem: message
      }, analysis);

      // Update session with the new response
      session.conversationHistory.push(
        { role: 'assistant', content: result.response }
      );

      // Check if session should end based on analysis
      session.isComplete = analysis.analysis.shouldFinalize;

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
}