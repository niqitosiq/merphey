import { PsychologistAnalysis } from '../services/psychologist.service';

// Define conversation step type
export enum ConversationStepType {
  INITIAL_ANALYSIS = 'initial_analysis',
  CONVERSATION_PLAN = 'conversation_plan',
  QUESTION_EXPLORATION = 'question_exploration',
  FINAL_ANALYSIS = 'final_analysis',
  HOMEWORK_GENERATION = 'homework_generation',
  STORY_GENERATION = 'story_generation',
}

export interface ConversationContext {
  initialProblem?: string;
  currentQuestion?: {
    text: string;
    id: string;
  };
  conversationHistory?: Array<{ role: string; content: string }>;
  psychologistAnalysis?: PsychologistAnalysis;
}

export interface ConversationMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export enum CommunicatorTag {
  NEED_GUIDANCE = 'NEED_GUIDANCE',
  DEEP_EMOTION = 'DEEP_EMOTION',
  RESISTANCE = 'RESISTANCE',
  CRISIS = 'CRISIS',
  TOPIC_CHANGE = 'TOPIC_CHANGE',
}

export enum PsychologistTag {
  CONTINUE = 'CONTINUE',
  ADJUST_APPROACH = 'ADJUST_APPROACH',
  EXPLORE_DEEPER = 'EXPLORE_DEEPER',
  WRAP_UP = 'WRAP_UP',
  CRISIS_PROTOCOL = 'CRISIS_PROTOCOL',
  SESSION_COMPLETE = 'SESSION_COMPLETE',
}

export enum SessionTag {
  SCHEDULE_FOLLOWUP = 'SCHEDULE_FOLLOWUP',
  URGENT_FOLLOWUP = 'URGENT_FOLLOWUP',
  REFER_SPECIALIST = 'REFER_SPECIALIST',
  MAINTENANCE_MODE = 'MAINTENANCE_MODE',
}

export enum HomeworkTag {
  REFLECTION = 'REFLECTION',
  BEHAVIORAL = 'BEHAVIORAL',
  COGNITIVE = 'COGNITIVE',
  EMOTIONAL = 'EMOTIONAL',
}

export enum StoryTag {
  INSIGHT = 'INSIGHT',
  HOPE = 'HOPE',
  COPING = 'COPING',
  GROWTH = 'GROWTH',
}

export interface PsychologistResponse {
  response: string;
  tags?: PsychologistTag[];
  role: 'psychologist';
}

export interface CommunicatorResponse {
  response: string;
  tags?: CommunicatorTag[];
  role: 'communicator';
}

export interface TherapyRecommendations {
  clinicalAnalysis: string;
  friendlyAnalysis: string;
  homework?: string;
  story?: string;
}

export interface QuestionNode {
  id: string;
  text: string;
  explanation?: string;
  subQuestions?: QuestionNode[];
  parentId?: string;
}

export interface ConversationPlan {
  mainTopics: QuestionNode[];
  recommendedDepth: number;
  warningSignals?: string[];
  completionCriteria?: string[];
}

export interface QuestionExplorationProgress {
  question: QuestionNode;
  isComplete: boolean;
  completionReason?: string;
  currentExchanges: number;
}
