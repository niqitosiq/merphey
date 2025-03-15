import { ConversationContext, UserMessage } from '../aggregates/conversation/entities/types';
import { RiskAssessment } from '../aggregates/conversation/entities/RiskAssessment';
import { TherapeuticPlan } from '../aggregates/therapy/entities/TherapeuticPlan';
import { ConversationState } from '../shared/enums';

/**
 * Interface for conversation storage operations
 * Defines how conversation data is stored and retrieved
 */
export interface ConversationRepositoryPort {
  /**
   * Retrieves conversation context for a user
   * @param userId - The user identifier
   * @returns ConversationContext - Complete conversation context with history
   */
  getConversationByUserId(userId: string): Promise<ConversationContext | null>;

  /**
   * Creates a new conversation for a user
   * @param userId - The user identifier
   * @param initialState - Initial conversation state
   * @returns ConversationContext - Newly created conversation context
   */
  createConversation(userId: string, initialState: ConversationState): Promise<ConversationContext>;

  /**
   * Adds a message to a conversation
   * @param conversationId - The conversation identifier
   * @param message - The message to add
   * @returns string - ID of the created message
   */
  addMessage(conversationId: string, message: UserMessage): Promise<string>;

  /**
   * Updates conversation state
   * @param conversationId - The conversation identifier
   * @param newState - New conversation state
   */
  updateState(conversationId: string, newState: ConversationState): Promise<void>;

  /**
   * Adds a risk assessment to the conversation
   * @param conversationId - The conversation identifier
   * @param assessment - The risk assessment to add
   */
  addRiskAssessment(conversationId: string, assessment: RiskAssessment): Promise<void>;
}

/**
 * Interface for therapeutic plan storage operations
 * Defines how plan data is stored and retrieved
 */
export interface PlanRepositoryPort {
  /**
   * Retrieves a therapeutic plan by ID
   * @param planId - The plan identifier
   * @returns TherapeuticPlan - The complete therapeutic plan with versions
   */
  getPlanById(planId: string): Promise<TherapeuticPlan | null>;

  /**
   * Retrieves the most recent therapeutic plan for a user
   * @param userId - The user identifier
   * @returns TherapeuticPlan - The user's current therapeutic plan
   */
  getCurrentPlanForUser(userId: string): Promise<TherapeuticPlan | null>;

  /**
   * Creates a new therapeutic plan for a user
   * @param userId - The user identifier
   * @param initialContent - Initial plan content
   * @returns TherapeuticPlan - The newly created plan
   */
  createPlan(userId: string, initialContent: any): Promise<TherapeuticPlan>;

  /**
   * Commits a new version of a therapeutic plan
   * @param planId - The plan identifier
   * @param newVersion - New version to add to the plan
   * @param validationScore - Score from validation process
   * @returns string - ID of the created version
   */
  commitNewVersion(planId: string, newVersion: any, validationScore: number): Promise<string>;
}
