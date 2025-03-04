import { ConversationPlan, QuestionExplorationProgress, QuestionNode } from './conversation';

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

export interface UserSession {
  id: string;
  userId: string;
  initialProblem?: string;
  analyzedProblem?: string;
  conversationPlan?: ConversationPlan;
  previousAnswers: Record<string, string>;
  questionProgress: Record<string, QuestionExplorationProgress>;
  conversationHistory: Array<{ role: string; content: string }>;
  currentQuestionId?: string;
  currentQuestionExchanges: number;
  isComplete: boolean;
  lastInteractionAt: Date;
  createdAt: Date;
}

export interface CreateUserSessionParams {
  userId: string;
  initialProblem?: string;
}

export class UserSessionFactory {
  static create({ userId, initialProblem }: CreateUserSessionParams): UserSession {
    return {
      id: Math.random().toString(36).substring(7),
      userId,
      initialProblem,
      previousAnswers: {},
      questionProgress: {},
      conversationHistory: [],
      currentQuestionExchanges: 0,
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

  // Properties for structured conversation
  conversationPlan?: ConversationPlan;
  currentQuestionStack: QuestionNode[];
  previousAnswers: Record<string, string>;
  conversationCompleted: boolean;

  // Properties for conversation context and depth tracking
  conversationHistory: Array<{ role: string; content: string }>;
  currentQuestionExchanges: number;

  // Properties for batch question exploration
  questionProgress: Record<string, QuestionExplorationProgress>;
  suggestedNextQuestions: QuestionNode[];

  constructor(userId: string) {
    this.userId = userId;
    this.state = ConversationState.IDLE;
    this.problemStatement = '';
    this.analyzedProblem = '';
    this.questionsAndAnswers = [];
    this.finalAnalysis = '';
    this.points = [];

    // Initialize structured conversation properties
    this.currentQuestionStack = [];
    this.previousAnswers = {};
    this.conversationCompleted = false;
    this.conversationHistory = [];
    this.currentQuestionExchanges = 0;

    // Initialize batch question exploration properties
    this.questionProgress = {};
    this.suggestedNextQuestions = [];
  }

  setProblemStatement(problem: string): void {
    this.problemStatement = problem;
    this.state = ConversationState.PROCESSING_PROBLEM;
  }

  setAnalyzedProblem(analyzed: string): void {
    this.analyzedProblem = analyzed;
    this.state = ConversationState.GENERATING_CONVERSATION_PLAN;
  }

  setConversationPlan(plan: ConversationPlan): void {
    this.conversationPlan = plan;
    this.state = ConversationState.EXPLORING_QUESTIONS;
    this.startConversation();
  }

  startConversation(): void {
    if (!this.conversationPlan || this.conversationPlan.mainTopics.length === 0) {
      throw new Error('No conversation plan available');
    }

    // Start with the first main question and reset exchanges counter
    this.currentQuestionStack = [this.conversationPlan.mainTopics[0]];
    this.currentQuestionExchanges = 0;
  }

  getCurrentQuestion(): QuestionNode | null {
    if (this.currentQuestionStack.length === 0) {
      return null;
    }
    return this.currentQuestionStack[this.currentQuestionStack.length - 1];
  }

  addAnswer(answer: string, questionResponse?: string): void {
    const currentQuestion = this.getCurrentQuestion();
    if (currentQuestion) {
      // Store answer with the question ID
      this.previousAnswers[currentQuestion.id] = answer;

      // Store in the traditional format for compatibility
      this.questionsAndAnswers.push({
        question: currentQuestion.text,
        answer,
      });

      // Add to conversation history
      if (questionResponse) {
        this.conversationHistory.push(
          { role: 'assistant', content: questionResponse },
          { role: 'user', content: answer },
        );
      }
    }

    // Determine the next question
    this.moveToNextQuestion();
  }

  moveToNextQuestion(): void {
    if (!this.conversationPlan) {
      return;
    }

    const currentQuestion = this.getCurrentQuestion();
    if (!currentQuestion) {
      return;
    }

    // Reset exchanges counter for the next question
    this.currentQuestionExchanges = 0;

    // Check if current question has subquestions and we haven't explored them yet
    if (
      currentQuestion.subQuestions &&
      currentQuestion.subQuestions.length > 0 &&
      !this.hasAnsweredAnySubQuestions(currentQuestion)
    ) {
      // Move to first subquestion
      this.currentQuestionStack.push(currentQuestion.subQuestions[0]);
      return;
    }

    // Remove the current question from the stack
    this.currentQuestionStack.pop();

    if (this.currentQuestionStack.length === 0) {
      // We've completed our main question, move to the next main question
      const mainTopics = this.conversationPlan.mainTopics;
      const lastCompletedIndex = mainTopics.findIndex(
        (q) => this.previousAnswers[q.id] !== undefined,
      );

      // If there's another main topic, move to it
      if (lastCompletedIndex < mainTopics.length - 1) {
        this.currentQuestionStack.push(mainTopics[lastCompletedIndex + 1]);
      } else {
        // We've completed all questions!
        this.conversationCompleted = true;
        this.state = ConversationState.GENERATING_ANALYSIS;
      }
      return;
    }

    // We've moved up, now check if there are sibling questions to explore
    const parentQuestion = this.currentQuestionStack[this.currentQuestionStack.length - 1];
    if (!parentQuestion.subQuestions) {
      return;
    }

    // Find last answered subquestion
    const lastAnsweredIndex = parentQuestion.subQuestions.findIndex(
      (q) => this.previousAnswers[q.id] !== undefined,
    );

    // Move to next subquestion if available
    if (lastAnsweredIndex < parentQuestion.subQuestions.length - 1) {
      this.currentQuestionStack.push(parentQuestion.subQuestions[lastAnsweredIndex + 1]);
    } else {
      // All subquestions answered, continue moving up
      this.moveToNextQuestion();
    }
  }

  hasAnsweredAnySubQuestions(question: QuestionNode): boolean {
    if (!question.subQuestions) {
      return false;
    }

    return question.subQuestions.some((q) => this.previousAnswers[q.id] !== undefined);
  }

  setPoints(points: string[]): void {
    this.points = points;
  }

  getPoints(): string {
    return this.points.join('\n');
  }

  setFinalAnalysis(analysis: string): void {
    this.finalAnalysis = analysis;
    this.state = ConversationState.IDLE;
  }

  updateQuestionProgress(progress: Record<string, QuestionExplorationProgress>): void {
    this.questionProgress = {
      ...this.questionProgress,
      ...progress,
    };

    // Check if all questions are complete
    if (this.conversationPlan) {
      const allQuestions = this.conversationPlan.mainTopics.reduce((acc, topic) => {
        acc.push(topic);
        if (topic.subQuestions) {
          acc.push(...topic.subQuestions);
        }
        return acc;
      }, [] as QuestionNode[]);

      const allComplete = allQuestions.every((q) => this.questionProgress[q.id]?.isComplete);

      if (allComplete) {
        this.conversationCompleted = true;
        this.state = ConversationState.GENERATING_ANALYSIS;
      }
    }
  }

  setSuggestedNextQuestions(questions: QuestionNode[]): void {
    this.suggestedNextQuestions = questions;
  }

  reset(): void {
    this.state = ConversationState.IDLE;
    this.problemStatement = '';
    this.analyzedProblem = '';
    this.questionsAndAnswers = [];
    this.finalAnalysis = '';
    this.points = [];
    this.conversationPlan = undefined;
    this.currentQuestionStack = [];
    this.previousAnswers = {};
    this.conversationCompleted = false;
    this.conversationHistory = [];
    this.currentQuestionExchanges = 0;
    this.questionProgress = {};
    this.suggestedNextQuestions = [];
  }
}
