import { ConversationState, Conversation as PrismaConversation } from '@prisma/client';
import { Conversation } from './Conversation';
import { v4 as uuidv4 } from 'uuid';

export class ConversationFactory {
  /**
   * Creates a new conversation entity
   */
  createConversation(params: { userId: string; initialState?: ConversationState }): Conversation {
    return new Conversation(
      uuidv4(),
      params.initialState || ConversationState.INFO_GATHERING,
      params.userId,
      [], // empty messages array
      [], // empty risk assessments array
      null, // no initial plan
      null, // no initial therapeutic plan
      null, // no initial context vector
      new Date(),
      new Date(),
    );
  }

  /**
   * Reconstructs a conversation entity from persistence
   */
  reconstitute(
    data: Omit<PrismaConversation, 'user' | 'messages' | 'riskAssessments' | 'therapeuticPlan'> & {
      messages: any[];
      riskAssessments: any[];
      therapeuticPlan: any | null;
    },
  ): Conversation {
    return new Conversation(
      data.id,
      data.state,
      data.userId,
      data.messages,
      data.riskAssessments,
      data.currentPlanId,
      data.therapeuticPlan,
      data.contextVector,
      data.createdAt,
      data.updatedAt,
    );
  }
}
