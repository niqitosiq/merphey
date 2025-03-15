import { Message as PrismaMessage, ConversationState, RiskLevel } from '@prisma/client';
import { TherapeuticPlan } from '../../therapy/entities/TherapeuticPlan';
import { RiskAssessment } from './RiskAssessment';

/**
 * Represents a user message in the system
 * Contains the content, metadata, and contextual information
 */
export type UserMessage = Omit<PrismaMessage, 'metadata'> & {
  metadata?: Record<string, any>;
  context?: ConversationState;
};

/**
 * Represents the complete context of a conversation
 * Includes user history, current state, risk profile, and therapeutic plan
 */
export type ConversationContext = {
  conversationId: string;
  userId: string;
  currentState: ConversationState;
  history: UserMessage[];
  riskHistory: RiskAssessment[];
  therapeuticPlan?: TherapeuticPlan;
};

/**
 * Response package returned to the user interface
 * Contains therapeutic response, updated context and session metrics
 */
export interface SessionResponse {
  /**
   * The therapeutic message to display to the user
   */
  message: string;

  /**
   * Additional metadata for UI display and tracking
   */
  metadata?: {
    /**
     * Current conversation state
     */
    state: ConversationState;

    /**
     * Current risk assessment level
     */
    riskLevel: RiskLevel;

    /**
     * Therapeutic techniques suggested in this response
     */
    suggestedTechniques?: string[];

    /**
     * Progress metrics for the current session
     */
    progressMetrics?: {
      score: number;
      insights: string[];
    };
  };
}

/**
 * Result of the processing pipeline
 * Contains all components needed to build a response and update the system state
 */
export interface ProcessingResult {
  /**
   * Risk assessment for the current message
   */
  riskAssessment: RiskAssessment;

  /**
   * Any state transition that occurred during processing
   */
  stateTransition: StateTransition;

  /**
   * The generated therapeutic response
   */
  therapeuticResponse: TherapeuticResponse;

  /**
   * Any updates to the therapeutic plan
   */
  planUpdate: PlanRevision;

  /**
   * Session progress metrics
   */
  sessionProgress: SessionProgress;
}

/**
 * Represents a state transition in the conversation
 */
export interface StateTransition {
  /**
   * Original state before transition
   */
  from: ConversationState;

  /**
   * New state after transition
   */
  to: ConversationState;

  /**
   * Explanation of why the transition occurred
   */
  reason: string;
}

/**
 * Therapeutic response generated for the user
 */
export interface TherapeuticResponse {
  /**
   * The actual text content to send to user
   */
  content: string;

  /**
   * Analysis insights derived during response generation
   */
  insights: any;

  /**
   * Therapeutic techniques suggested in the response
   */
  suggestedTechniques?: string[];
}

/**
 * Plan revision information
 */
export interface PlanRevision {
  /**
   * Whether the plan needed revision
   */
  revisionRequired: boolean;

  /**
   * ID of the newly created version, if revision occurred
   */
  newVersionId?: string;

  /**
   * Details of changes made in the revision
   */
  changes?: {
    addedTechniques: string[];
    removedTechniques: string[];
    adjustedGoals: Record<string, any>;
  };
}

/**
 * Session progress metrics
 */
export interface SessionProgress {
  /**
   * Overall progress score for the session
   */
  score: number;

  /**
   * Level of user engagement
   */
  engagementLevel: string;

  /**
   * Therapeutic breakthroughs identified
   */
  breakthroughs: string[];

  /**
   * Ongoing challenges identified
   */
  challenges: string[];
}
