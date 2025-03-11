import { ConversationState, RiskLevel } from '../models/conversation';

export interface BaseResponse {
  text: string;
  reason: string;
}

export interface StateTransitionSuggestion {
  suggestedNextState: ConversationState;
  stateReason: string;
  riskLevel: RiskLevel;
}

export interface PsychologistResponse extends BaseResponse {
  prompt: string;
  action: 'FINISH_SESSION' | 'APPOINT_NEXT_SESSION' | 'COMMUNICATE';
  nextState: ConversationState;
  stateReason: string;
  riskLevel: RiskLevel;
  therapeuticPlan?: string;
  safetyRecommendations?: string[];
}

export interface CommunicatorResponse extends BaseResponse {
  suggestedNextState: ConversationState;
  stateReason: string;
  urgency: RiskLevel;
  emotionalTone: string;
  riskFactors: string[];
  engagementLevel?: 'LOW' | 'MEDIUM' | 'HIGH';
  currentActionStep?: number;
  stepProgress?: string;
}

export interface FinishingResponse extends BaseResponse {
  recommendations: string;
  nextSteps: string;
  action: 'FINISH_SESSION' | 'APPOINT_NEXT_SESSION';
  summaryMetrics?: {
    progressMade: number;
    engagementQuality: number;
    riskTrend: 'IMPROVING' | 'STABLE' | 'WORSENING';
  };
}

export * from './psychologist.prompt';
export * from './communicator.prompt';
export * from './finishing.prompt';
