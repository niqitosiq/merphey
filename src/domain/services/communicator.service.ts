import { Logger } from '../../utils/logger';
import { PsychologistService, PsychologistAnalysis } from './psychologist.service';
import { makeSuggestionOrAsk, analyzeStep } from '../../infrastructure/llm/conversation-processors';
import { ConversationStepType, CommunicatorTag, PsychologistTag } from '../entities/conversation';

interface CommunicatorResponse {
  messages: string[];
  shouldEndSession?: boolean;
}

interface ConversationContext {
  conversationHistory: Array<{ role: string; content: string }>;
  currentQuestion: { text: string; id: string };
  initialProblem?: string;
  psychologistAnalysis?: PsychologistAnalysis;
}

export class CommunicatorService {
  private readonly logger = Logger.getInstance();
  private readonly conversationStates = new Map<string, Array<{ role: string; content: string }>>();

  private readonly greetings = [
    'Здравствуйте! 👋 Я ваш дружелюбный помощник.',
    'Добрый день! Рад вас видеть. 😊',
    'Приветствую вас! 🌟',
  ];

  constructor(private readonly psychologist: PsychologistService) {}

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
      tags: psychologistAnalysis.tags,
    });

    if (psychologistAnalysis.tags?.includes(PsychologistTag.CRISIS_PROTOCOL)) {
      return {
        messages: [
          'Я вижу, что ситуация требует особого внимания.',
          'Рекомендую обратиться к специалисту для личной консультации.',
        ],
        shouldEndSession: false,
      };
    }

    if (psychologistAnalysis.tags?.includes(PsychologistTag.SESSION_COMPLETE)) {
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

    if (psychologistAnalysis.tags?.includes(PsychologistTag.WRAP_UP)) {
      return {
        messages: [
          'Давайте подведем промежуточный итог нашей беседы...',
          psychologistAnalysis.analysis,
        ],
      };
    }

    return {
      messages: [psychologistAnalysis.analysis],
    };
  }

  async handleUserMessage(userId: string, message: string): Promise<CommunicatorResponse> {
    this.logger.info('Handling user message', { userId });

    let history = this.conversationStates.get(userId) || [];
    history.push({ role: 'user', content: message });

    const context: ConversationContext = {
      conversationHistory: history,
      currentQuestion: { text: message, id: 'current' },
    };

    let communicatorResponse = await makeSuggestionOrAsk(context);

    let { shouldConsultPsychologist, shouldEndSession, messages } =
      await this.handleCommunicatorTags(userId, communicatorResponse, history);
    this.logger.debug('Final detected', {
      tags: JSON.stringify(
        {
          shouldConsultPsychologist,
          shouldEndSession,
          messages,
        },
        null,
        '   ',
      ),
    });
    if (shouldEndSession) {
      this.conversationStates.delete(userId);
      return { messages, shouldEndSession };
    }

    // while (shouldConsultPsychologist) {
    const analysis = await this.psychologist.analyzeSituation(
      userId,
      {
        text: messages.join('\n\n'),
        id: 'current',
      },
      history,
    );
    const psychResponse = await this.handlePsychologistTags(userId, analysis, history);
    this.logger.debug('Final detected', { tags: JSON.stringify(psychResponse, null, '   ') });

    if (psychResponse.shouldEndSession) {
      messages.push(...psychResponse.messages);
      this.conversationStates.delete(userId);
      return psychResponse;
    }

    history.push({
      role: 'psychologist',
      content: `Psychologist analysis: \n ${analysis.analysis}`,
    });

    communicatorResponse = await makeSuggestionOrAsk(context);

    const resp = await this.handleCommunicatorTags(userId, communicatorResponse, history);
    messages = resp.messages;
    // shouldConsultPsychologist = resp.shouldConsultPsychologist;
    // }

    history.push({ role: 'assistant', content: messages.join('\n\n') });
    this.conversationStates.set(userId, history);

    return {
      messages,
      shouldEndSession,
    };
  }
}
