/**
 * UserAggregate - Main transaction boundary for user interactions
 */

import { User } from '../entities/user.entity';
import { ConversationState } from '../value-objects/conversation-state.value-object';
import { MessageHistory } from '../value-objects/message-history.value-object';
import { RiskSpectrum } from '../../risk-management/value-objects/risk-level.value-object';

export class UserAggregate {
  private user: User;
  private messageHistory: MessageHistory;

  constructor(user: User, messageHistory: MessageHistory) {
    this.user = user;
    this.messageHistory = messageHistory;
  }

  // Get the current user state
  getUser(): User {
    return { ...this.user }; // Return a copy to prevent direct mutation
  }

  // Get the user's message history
  getMessageHistory(): MessageHistory {
    return { ...this.messageHistory }; // Return a copy to prevent direct mutation
  }

  // Update user's risk profile
  updateRiskProfile(riskSpectrum: RiskSpectrum): void {
    this.user = {
      ...this.user,
      riskProfile: riskSpectrum.level,
      updatedAt: new Date(),
    };
  }

  // Transition to a new conversation state
  transitionState(newState: ConversationState, contextData: Record<string, any> = {}): void {
    this.user = {
      ...this.user,
      conversationState: newState,
      updatedAt: new Date(),
    };
  }

  // Add a new message to history
  addMessage(content: string, sender: 'USER' | 'BOT', metadata?: any): void {
    const newMessage = {
      id: crypto.randomUUID(),
      content,
      timestamp: new Date(),
      sender,
      metadata,
      historyId: this.messageHistory.id,
    };

    this.messageHistory = {
      ...this.messageHistory,
      messages: [...this.messageHistory.messages, newMessage],
    };
  }

  // Update plan version
  updatePlanId(planId: string): void {
    if (!this.user.plans) {
      this.user.plans = [];
    }

    this.user = {
      ...this.user,
      plans: [...this.user.plans, { id: planId }],
      updatedAt: new Date(),
    };
  }
}
