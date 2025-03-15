import { Conversation as PrismaConversation, ConversationState } from '@prisma/client';
import { Message } from './Message';
import { RiskAssessment } from './RiskAssessment';
import { TherapeuticPlan } from '../../therapy/entities/TherapeuticPlan';

export class Conversation implements Omit<PrismaConversation, 'contextVector'> {
  constructor(
    public readonly id: string,
    public state: ConversationState,
    public readonly userId: string,
    public messages: Message[],
    public riskAssessments: RiskAssessment[],
    public currentPlanId: string | null,
    public therapeuticPlan: TherapeuticPlan | null,
    public contextVector: string | null,
    public readonly createdAt: Date,
    public readonly updatedAt: Date,
  ) {}

  /**
   * Add a new message to the conversation
   */
  addMessage(message: Message): void {
    this.messages.push(message);
  }

  /**
   * Add a new risk assessment to the conversation
   */
  addRiskAssessment(assessment: RiskAssessment): void {
    this.riskAssessments.push(assessment);
  }

  /**
   * Update the conversation state
   */
  updateState(newState: ConversationState): void {
    this.state = newState;
  }

  /**
   * Update the therapeutic plan
   */
  updateTherapeuticPlan(plan: TherapeuticPlan): void {
    this.therapeuticPlan = plan;
    this.currentPlanId = plan.id;
  }

  /**
   * Update the context vector
   */
  updateContextVector(vector: string): void {
    this.contextVector = vector;
  }

  /**
   * Get the most recent message
   */
  getLatestMessage(): Message | undefined {
    return this.messages[this.messages.length - 1];
  }

  /**
   * Get the most recent risk assessment
   */
  getLatestRiskAssessment(): RiskAssessment | undefined {
    return this.riskAssessments[this.riskAssessments.length - 1];
  }
}
