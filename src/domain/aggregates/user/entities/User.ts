import { Conversation } from '../../conversation/entities/Conversation';
import { TherapeuticPlan } from '../../therapy/entities/TherapeuticPlan';

export class User {
  constructor(
    public readonly id: string,
    public readonly createdAt: Date,
    public readonly updatedAt: Date,
    private _balance: number,
    private conversations: Conversation[] = [],
    private therapeuticPlans: TherapeuticPlan[] = [],
  ) {}

  /**
   * Get all conversations associated with the user
   */
  getConversations(): Conversation[] {
    return [...this.conversations];
  }

  /**
   * Get all therapeutic plans associated with the user
   */
  getTherapeuticPlans(): TherapeuticPlan[] {
    return [...this.therapeuticPlans];
  }

  /**
   * Add a new conversation to the user
   */
  addConversation(conversation: Conversation): void {
    this.conversations.push(conversation);
  }

  /**
   * Add a new therapeutic plan to the user
   */
  addTherapeuticPlan(plan: TherapeuticPlan): void {
    this.therapeuticPlans.push(plan);
  }

  /**
   * Get the latest therapeutic plan for the user
   */
  getLatestTherapeuticPlan(): TherapeuticPlan | undefined {
    if (this.therapeuticPlans.length === 0) {
      return undefined;
    }
    return this.therapeuticPlans[this.therapeuticPlans.length - 1];
  }

  /**
   * Get the latest conversation for the user
   */
  getLatestConversation(): Conversation | undefined {
    if (this.conversations.length === 0) {
      return undefined;
    }
    return this.conversations[this.conversations.length - 1];
  }
  get balance(): number {
    return this._balance;
  }

  get hasEnoughBalanceForSession(): boolean {
    return this._balance >= 1; // 1 balance unit = 1 session
  }

  increaseBalance(amount: number): void {
    if (amount <= 0) {
      throw new Error('Balance increase amount must be positive');
    }
    this._balance += amount;
  }

  decreaseBalance(amount: number): void {
    if (amount <= 0) {
      throw new Error('Balance decrease amount must be positive');
    }

    if (this._balance < amount) {
      throw new Error('Insufficient balance');
    }

    this._balance -= amount;
  }

  deductSessionCost(): void {
    this.decreaseBalance(1); // Each session costs 1 balance unit
  }
}
