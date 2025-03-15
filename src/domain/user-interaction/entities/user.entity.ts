/**
 * User Entity - Core domain object representing a user in the system
 */

import { RiskLevel } from '../../risk-management/value-objects/risk-level.value-object';
import { ConversationState } from '../value-objects/conversation-state.value-object';

export interface User {
  id: string;
  riskProfile?: RiskLevel;
  conversationState?: ConversationState;
  planVersion?: number;
  createdAt: Date;
  updatedAt: Date;
}
