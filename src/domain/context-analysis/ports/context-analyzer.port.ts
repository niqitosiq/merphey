import { MessageHistory } from '../../user-interaction/value-objects/message-history.value-object';
import { TherapeuticPlanData } from '../../plan-management/value-objects/therapeutic-plan.value-object';
import { ContextDelta, ContextScore } from '../services/context-monitor.service';

export interface IContextAnalyzer {
  detectContextShift(plan: TherapeuticPlanData, messageHistory: MessageHistory): Promise<ContextDelta>;
  calculateSemanticSimilarity(targetConcepts: string[], messageHistory: MessageHistory): Promise<ContextScore>;
  analyzeTemporalPatterns(messageHistory: MessageHistory): Promise<any>;
}