import { Logger } from '../../utils/logger';
import { AzureOpenAIService } from '../../infrastructure/llm/azure-openai.service';
import { UserSessionRepository } from '../repositories/user-session.repository';
import {
  analyzeStep,
  finalAnalyze,
  generateHomework,
  generateStory,
} from '../../infrastructure/llm/conversation-processors';
import {
  ConversationStepType,
  PsychologistTag,
  HomeworkTag,
  StoryTag,
  SessionTag,
} from '../entities/conversation';

export interface PsychologistAnalysis {
  analysis: {
    analysis: string;
    suggestedAction: 'ask' | 'tell' | 'finalize' | 'seek_guidance';
    shouldFinalize: boolean;
    nextSteps: string[];
    warningSignals: string[];
    therapeuticGoals: string[];
    tags: PsychologistTag[];
    recommendedApproach: string;
  };
  suggestedAction: string;
  shouldFinalize: boolean;
}

interface TherapyRecommendations {
  analysis: string;
  homework?: string;
  story?: string;
}

export class PsychologistService {
  private readonly logger = Logger.getInstance();

  constructor(
    private readonly llmService: AzureOpenAIService,
    private readonly sessionRepository: UserSessionRepository,
  ) {}

  async analyzeSituation(
    userId: string,
    conversationHistory: Array<{ role: string; content: string }>,
  ): Promise<PsychologistAnalysis> {
    this.logger.info('Analyzing conversation situation', { userId });

    const session = await this.sessionRepository.findByUserId(userId);
    if (!session) {
      // create session
      throw new Error('No session found for user');
    }

    const result = await this.llmService.process(
      analyzeStep,
      {
        conversationHistory,
        currentQuestion: session.currentQuestion,
      },
      ConversationStepType.QUESTION_EXPLORATION,
    );

    // Make analysis more detailed based on tags
    this.logger.debug('Psychologist tags detected', { tags: result.analysis.tags });

    let shouldFinalize =
      result.analysis.tags.includes(PsychologistTag.SESSION_COMPLETE) ||
      result.analysis.tags.includes(PsychologistTag.CRISIS_PROTOCOL);

    // Adjust the analysis based on detected tags
    if (result.analysis.tags.includes(PsychologistTag.EXPLORE_DEEPER)) {
      result.analysis.recommendedApproach =
        'Углубить исследование темы, задавать более глубокие вопросы';
    } else if (result.analysis.tags.includes(PsychologistTag.ADJUST_APPROACH)) {
      result.analysis.recommendedApproach = 'Скорректировать подход, проявить больше эмпатии';
    }

    return {
      analysis: result.analysis,
      suggestedAction: result.analysis.suggestedAction,
      shouldFinalize,
    };
  }

  async finalizeSession(
    userId: string,
    conversationHistory: Array<{ role: string; content: string }>,
  ): Promise<TherapyRecommendations> {
    this.logger.info('Finalizing session', { userId });

    // Generate final analysis
    const analysisResult = await this.llmService.process(
      finalAnalyze,
      { conversationHistory },
      ConversationStepType.FINAL_ANALYSIS,
    );

    // Generate appropriate homework based on session content
    const homeworkResult = await this.llmService.process(
      generateHomework,
      { conversationHistory },
      ConversationStepType.HOMEWORK_GENERATION,
    );

    // Generate therapeutic story
    const storyResult = await this.llmService.process(
      generateStory,
      { conversationHistory },
      ConversationStepType.STORY_GENERATION,
    );

    // Process analysis results and add urgency/followup recommendations
    const analysisContent = JSON.parse(analysisResult.analysis || '{}');
    let finalAnalysis = analysisResult.analysis || '';

    if (analysisContent.tags?.includes(SessionTag.URGENT_FOLLOWUP)) {
      finalAnalysis += '\n\nВажно: Рекомендуется срочная следующая сессия.';
    } else if (analysisContent.tags?.includes(SessionTag.SCHEDULE_FOLLOWUP)) {
      finalAnalysis += '\n\nРекомендуется запланировать следующую сессию в ближайшее время.';
    }

    return {
      analysis: finalAnalysis,
      homework: homeworkResult.homework || undefined,
      story: storyResult.story || undefined,
    };
  }
}
