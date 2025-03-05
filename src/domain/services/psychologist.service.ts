import { Logger } from '../../utils/logger';
import { UserSessionRepository } from '../repositories/user-session.repository';
import {
  analyzeStep,
  finalAnalyze,
  generateHomework,
  generateStory,
} from '../../infrastructure/llm/conversation-processors';
import { PsychologistTag } from '../entities/conversation';

export interface PsychologistAnalysis {
  analysis: string;
  shouldFinalize: boolean;
  tags?: PsychologistTag[];
}

interface TherapyRecommendations {
  analysis: string;
  homework?: string;
  story?: string;
}

export class PsychologistService {
  private readonly logger = Logger.getInstance();

  constructor(private readonly sessionRepository: UserSessionRepository) {}

  async analyzeSituation(
    userId: string,
    currentQuestion: { text: string; id: string },
    conversationHistory: Array<{ role: string; content: string }>,
  ): Promise<PsychologistAnalysis> {
    this.logger.info('Analyzing conversation situation', { userId });

    const session = await this.sessionRepository.findByUserId(userId);
    if (!session) {
      throw new Error('No session found for user');
    }

    const { tags, response } = await analyzeStep({
      conversationHistory,
      currentQuestion,
    });

    // Make analysis more detailed based on tags
    this.logger.debug('Psychologist tags detected', {
      tags: JSON.stringify(response, null, '   '),
    });

    let shouldFinalize =
      tags?.includes(PsychologistTag.SESSION_COMPLETE) ||
      tags?.includes(PsychologistTag.CRISIS_PROTOCOL) ||
      false;

    return {
      analysis: response,
      shouldFinalize,
    };
  }

  async finalizeSession(
    userId: string,
    conversationHistory: Array<{ role: string; content: string }>,
  ): Promise<TherapyRecommendations> {
    this.logger.info('Finalizing session', { userId });

    // Generate final analysis
    const analysisResult = await finalAnalyze({ conversationHistory });

    // Generate appropriate homework based on session content
    const homeworkResult = await generateHomework({ conversationHistory });

    // Generate therapeutic story
    const storyResult = await generateStory({ conversationHistory });

    // Process analysis results and add urgency/followup recommendations
    let finalAnalysis = analysisResult.analysis || '';

    if (analysisResult.tags.includes(PsychologistTag.CRISIS_PROTOCOL)) {
      finalAnalysis += '\n\nВажно: Рекомендуется срочная следующая сессия.';
    } else if (analysisResult.tags.includes(PsychologistTag.WRAP_UP)) {
      finalAnalysis += '\n\nРекомендуется запланировать следующую сессию в ближайшее время.';
    }

    this.logger.debug('Final detected', { tags: JSON.stringify(finalAnalysis, null, '   ') });
    return {
      analysis: finalAnalysis,
      homework: homeworkResult.homework || undefined,
      story: storyResult.story || undefined,
    };
  }
}
