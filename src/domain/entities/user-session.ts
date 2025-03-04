export enum ConversationState {
  IDLE = 'idle',
  WAITING_FOR_PROBLEM = 'waiting_for_problem',
  PROCESSING_PROBLEM = 'processing_problem',
  ASKING_QUESTIONS = 'asking_questions',
  GENERATING_ANALYSIS = 'generating_analysis',
}

export interface QuestionAnswer {
  question: string;
  answer: string;
}

export class UserSession {
  userId: string;
  state: ConversationState;
  problemStatement: string;
  analyzedProblem: string;
  currentQuestionIndex: number;
  questions: string[];
  questionsAndAnswers: QuestionAnswer[];
  finalAnalysis: string;

  constructor(userId: string) {
    this.userId = userId;
    this.state = ConversationState.IDLE;
    this.problemStatement = '';
    this.analyzedProblem = '';
    this.currentQuestionIndex = 0;
    this.questions = [];
    this.questionsAndAnswers = [];
    this.finalAnalysis = '';
  }

  setProblemStatement(problem: string): void {
    this.problemStatement = problem;
    this.state = ConversationState.PROCESSING_PROBLEM;
  }

  setAnalyzedProblem(analyzed: string): void {
    this.analyzedProblem = analyzed;
  }

  setQuestions(questions: string[]): void {
    this.questions = questions;
    this.currentQuestionIndex = 0;
    this.state = ConversationState.ASKING_QUESTIONS;
  }

  getCurrentQuestion(): string | null {
    if (this.currentQuestionIndex < this.questions.length) {
      return this.questions[this.currentQuestionIndex];
    }
    return null;
  }

  addAnswer(answer: string): void {
    const currentQuestion = this.getCurrentQuestion();
    if (currentQuestion) {
      this.questionsAndAnswers.push({
        question: currentQuestion,
        answer,
      });
    }
    this.currentQuestionIndex++;

    // Check if we've gone through all questions
    if (this.currentQuestionIndex >= this.questions.length) {
      this.state = ConversationState.GENERATING_ANALYSIS;
    }
  }

  setFinalAnalysis(analysis: string): void {
    this.finalAnalysis = analysis;
    this.state = ConversationState.IDLE;
  }

  reset(): void {
    this.state = ConversationState.IDLE;
    this.problemStatement = '';
    this.analyzedProblem = '';
    this.currentQuestionIndex = 0;
    this.questions = [];
    this.questionsAndAnswers = [];
    this.finalAnalysis = '';
  }
}
