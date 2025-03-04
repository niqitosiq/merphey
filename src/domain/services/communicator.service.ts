import { Logger } from '../../utils/logger';
import { PsychologistService, PsychologistAnalysis } from './psychologist.service';
import { makeSuggestionOrAsk } from '../../infrastructure/llm/conversation-processors';
import { AzureOpenAIService } from '../../infrastructure/llm/azure-openai.service';
import { ConversationStepType, CommunicatorTag, PsychologistTag } from '../entities/conversation';

interface CommunicatorResponse {
  messages: string[];
  shouldEndSession?: boolean;
}

export class CommunicatorService {
  private readonly logger = Logger.getInstance();
  private readonly conversationStates = new Map<string, Array<{ role: string; content: string }>>();

  private readonly greetings = [
    'Здравствуйте! 👋 Я ваш дружелюбный помощник.',
    'Добрый день! Рад вас видеть. 😊',
    'Приветствую вас! 🌟',
  ];

  constructor(
    private readonly psychologist: PsychologistService,
    private readonly llmService: AzureOpenAIService,
  ) {}

  async startConversation(userId: string): Promise<string> {
    this.logger.info('Starting new conversation', { userId });

    // Initialize or reset conversation history
    this.conversationStates.set(userId, []);

    const greeting = this.greetings[Math.floor(Math.random() * this.greetings.length)];
    const initialQuestion =
      'Расскажите, пожалуйста, что вас беспокоит или какую тему вы хотели бы обсудить?';

    return `${greeting}\n\n${initialQuestion}`;
  }

  private async handleCommunicatorTags(
    userId: string,
    response: { response: string; tags?: CommunicatorTag[] },
    history: Array<{ role: string; content: string }>,
  ): Promise<{
    messages: string[];
    shouldConsultPsychologist: boolean;
    shouldEndSession?: boolean;
  }> {
    const messages: string[] = [response.response];
    let shouldConsultPsychologist = false;
    let shouldEndSession = false;

    if (response.tags?.length) {
      this.logger.debug('Processing communicator tags', { userId, tags: response.tags });

      if (
        response.tags.includes(CommunicatorTag.NEED_GUIDANCE) ||
        response.tags.includes(CommunicatorTag.DEEP_EMOTION) ||
        response.tags.includes(CommunicatorTag.CRISIS)
      ) {
        shouldConsultPsychologist = true;
      }

      if (response.tags.includes(CommunicatorTag.CRISIS)) {
        messages.push(
          'Я вижу, что ситуация серьезная. Позвольте мне проконсультироваться, чтобы предложить наилучшую поддержку.',
        );
      }

      if (response.tags.includes(CommunicatorTag.RESISTANCE)) {
        messages.push(
          'Я понимаю, что некоторые темы могут быть непростыми для обсуждения. Мы можем двигаться в том темпе, который комфортен для вас.',
        );
      }
    }

    return { messages, shouldConsultPsychologist, shouldEndSession };
  }

  private async handlePsychologistTags(
    userId: string,
    psychologistAnalysis: PsychologistAnalysis,
    history: Array<{ role: string; content: string }>,
  ): Promise<CommunicatorResponse> {
    this.logger.debug('Processing psychologist tags', {
      userId,
      tags: psychologistAnalysis.analysis.tags,
    });

    if (psychologistAnalysis.analysis.tags.includes(PsychologistTag.CRISIS_PROTOCOL)) {
      return {
        messages: [
          'Я вижу, что ситуация требует особого внимания.',
          'Рекомендую обратиться к специалисту для личной консультации.',
        ],
        shouldEndSession: false,
      };
    }

    if (psychologistAnalysis.analysis.tags.includes(PsychologistTag.SESSION_COMPLETE)) {
      const recommendations = await this.psychologist.finalizeSession(userId, history);

      const messages = ['Спасибо за откровенный разговор.', recommendations.analysis];

      if (recommendations.homework) {
        messages.push('📚 Домашнее задание:\n' + recommendations.homework);
      }

      if (recommendations.story) {
        messages.push(
          '🌟 И напоследок, небольшая история для размышления:\n' + recommendations.story,
        );
      }

      return {
        messages,
        shouldEndSession: true,
      };
    }

    if (psychologistAnalysis.analysis.tags.includes(PsychologistTag.WRAP_UP)) {
      return {
        messages: [
          'Давайте подведем промежуточный итог нашей беседы...',
          psychologistAnalysis.analysis.analysis,
        ],
      };
    }

    return {
      messages: [psychologistAnalysis.analysis.analysis],
    };
  }

  async handleUserMessage(userId: string, message: string): Promise<CommunicatorResponse> {
    this.logger.info('Handling user message', { userId });

    // Get or initialize conversation history
    let history = this.conversationStates.get(userId) || [];
    history.push({ role: 'user', content: message });

    // Get initial communicator response
    let communicatorResponse = await this.llmService.process(
      makeSuggestionOrAsk,
      {
        conversationHistory: history,
        currentQuestion: { text: message, id: 'current' },
      },
      ConversationStepType.QUESTION_EXPLORATION,
    );

    // Handle communicator tags
    let { shouldConsultPsychologist, shouldEndSession, messages } =
      await this.handleCommunicatorTags(userId, communicatorResponse, history);

    history.push({ role: 'assistant', content: messages.join('\n\n') });

    // Implement consultation loop
    while (shouldConsultPsychologist) {
      const analysis = await this.psychologist.analyzeSituation(userId, history);
      const psychResponse = await this.handlePsychologistTags(userId, analysis, history);

      // Add psychologist's guidance to the response
      if (psychResponse.shouldEndSession) {
        messages.push(...psychResponse.messages);
        this.conversationStates.delete(userId);
        return psychResponse;
      }

      communicatorResponse = await this.llmService.process(
        makeSuggestionOrAsk,
        {
          conversationHistory: history,
          currentQuestion: { text: message, id: 'current' },
          initialProblem: message,
          psychologistAnalysis: analysis,
        },
        ConversationStepType.QUESTION_EXPLORATION,
      );

      const resp = await this.handleCommunicatorTags(userId, communicatorResponse, history);
      messages = resp.messages;
      shouldConsultPsychologist = resp.shouldConsultPsychologist;

      console.log('shouldConsultPsychologist', shouldConsultPsychologist);
      history.push({ role: 'assistant', content: psychResponse.messages.join('\n\n') });
      history.push({ role: 'assistant', content: messages.join('\n\n') });
    }

    // Add final response to history and update state
    this.conversationStates.set(userId, history);

    return {
      messages,
      shouldEndSession,
    };
  }
}
