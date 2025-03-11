export enum ConversationState {
  INITIAL = 'INITIAL',
  GATHERING_INFO = 'GATHERING_INFO',
  ANALYSIS_NEEDED = 'ANALYSIS_NEEDED',
  PENDING_ANALYSIS = 'PENDING_ANALYSIS', // Added new blocking state
  DEEP_ANALYSIS = 'DEEP_ANALYSIS',
  GUIDANCE_DELIVERY = 'GUIDANCE_DELIVERY',
  SESSION_CLOSING = 'SESSION_CLOSING',
  ERROR_RECOVERY = 'ERROR_RECOVERY',
}

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface HistoryMessage {
  text: string;
  from: 'user' | 'assistant' | 'psychologist';
  role: 'user' | 'assistant' | 'system';
  timestamp: number;
  metadata?: {
    riskLevel?: RiskLevel;
    emotionalTone?: string;
    riskFactors?: string[];
    reason?: string;
    stateTransition?: {
      from: ConversationState;
      to: ConversationState;
      reason: string;
    };
    guidance?: {
      prompt?: string;
      therapeuticPlan?: string;
      safetyRecommendations?: string[];
      currentStep?: number;
      stepProgress?: string;
    };
  };
}

export interface ConversationContext {
  userId: string;
  history: HistoryMessage[];
  state: ConversationState;
  isThinking: boolean;
  lastAnalysisTimestamp?: number;
  sessionStartTime: number;
  lastUpdated: number;
  riskLevel: RiskLevel;
  activeBackgroundTasks?: string[];
  therapeuticPlan?: string; // Added therapeutic plan tracking
  activeGuidance?: {
    prompt: string;
    currentStep: number;
    stepProgress: string;
    therapeuticPlan: string;
    safetyRecommendations: string[];
  };
}

export interface StateTransition {
  from: ConversationState;
  to: ConversationState;
  reason: string;
  riskLevel: RiskLevel;
  forcedByRisk?: boolean;
}

export interface ConversationMetrics {
  messageCount: number;
  lastResponseTime: number;
  averageResponseTime: number;
  stateChanges: StateTransition[];
  currentRiskLevel: RiskLevel;
  sessionDuration: number;
}
