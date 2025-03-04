// Define conversation step type
export enum ConversationStepType {
  INITIAL_ANALYSIS = 'initial_analysis',
  QUESTION_GENERATION = 'question_generation',
  CONVERSATION_PLAN = 'conversation_plan',
  QUESTION_EXPLORATION = 'question_exploration',
  FINAL_ANALYSIS = 'final_analysis',
}

export interface ConversationContext {
  initialProblem?: string;
  analyzedProblem?: string;
  questionsAndAnswers?: Array<{ question: string; answer: string }>;
  conversationPlan?: ConversationPlan;
  currentQuestion?: QuestionNode;
  previousAnswers?: Record<string, string>;
  conversationHistory?: Array<{ role: string; content: string }>;
  currentQuestionExchanges?: number;
  questionProgress?: Record<string, QuestionExplorationProgress>;
}

export interface ConversationPlan {
  mainTopics: QuestionNode[];
  recommendedDepth: number;
}

export interface QuestionNode {
  id: string;
  text: string;
  explanation?: string;
  subQuestions?: QuestionNode[];
  parentId?: string;
}

export interface QuestionExplorationResult {
  response: string;
  isComplete: boolean;
  completionReason?: string;
}

export interface QuestionExplorationProgress {
  question: QuestionNode;
  isComplete: boolean;
  completionReason?: string;
  currentExchanges: number;
}

export interface BatchExplorationResult {
  response: string;
  questionsProgress: Record<string, QuestionExplorationProgress>;
  suggestedNextQuestions: QuestionNode[];
  shouldContinue: boolean;
}

export interface ConversationMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}