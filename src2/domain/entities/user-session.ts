import { ConversationContext } from './conversation';

export enum ConversationState {
  IDLE = 'idle',
  WAITING_FOR_PROBLEM = 'waiting_for_problem',
  PROCESSING_PROBLEM = 'processing_problem',
  GENERATING_CONVERSATION_PLAN = 'generating_conversation_plan',
  EXPLORING_QUESTIONS = 'exploring_questions',
  GENERATING_ANALYSIS = 'generating_analysis',
}

export interface QuestionAnswer {
  question: string;
  answer: string;
}

export type UserSession = {
  id: string;
  userId: string;
  isComplete: boolean;
  lastInteractionAt: Date;
  createdAt: Date;
} & ConversationContext;

export interface CreateUserSessionParams {
  userId: string;
}

export class UserSessionFactory {
  static create({ userId }: CreateUserSessionParams): UserSession {
    return {
      id: userId,
      userId,
      history: [],
      isComplete: false,
      lastInteractionAt: new Date(),
      createdAt: new Date(),
    };
  }
}

export class UserSessionManager {
  userId: string;
  state: ConversationState;
  problemStatement: string;
  analyzedProblem: string;
  questionsAndAnswers: QuestionAnswer[];
  finalAnalysis: string;
  points: string[];

  previousAnswers: Record<string, string>;
  conversationCompleted: boolean;

  // Properties for conversation context and depth tracking
  conversationHistory: Array<{ role: string; content: string }>;
  currentQuestionExchanges: number;

  constructor(userId: string) {
    this.userId = userId;
    this.state = ConversationState.IDLE;
  }

  setFinalAnalysis(analysis: string): void {
    this.finalAnalysis = analysis;
    this.state = ConversationState.IDLE;
  }

  reset(): void {
    this.state = ConversationState.IDLE;
    this.conversationHistory = [];
  }
}
