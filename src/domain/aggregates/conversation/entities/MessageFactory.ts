import { Message } from './Message';
import { v4 as uuidv4 } from 'uuid';
import { Metadata } from './types';
import { scoped, Lifecycle, injectable, autoInjectable } from 'tsyringe';

/**
 * Factory for creating message entities
 * Handles the creation of different types of messages with appropriate metadata
 */

@scoped(Lifecycle.ContainerScoped)
@injectable()
@autoInjectable()
export class MessageFactory {
  /**
   * Creates a message with provided parameters
   */
  createMessage(params: {
    content: string;
    role: string;
    conversationId: string;
    metadata?: Metadata;
  }): Message {
    return new Message(
      uuidv4(),
      params.content,
      params.role,
      params.conversationId,
      params.metadata || {},
      new Date(),
    );
  }
  /**
   * Creates an assistant message
   */
  createAssistantMessage(conversationId: string, content: string, metadata: Metadata): Message {
    return Message.createAssistantMessage(conversationId, content, metadata);
  }

  /**
   * Reconstructs a message from persistence
   */
  reconstitute(data: {
    id: string;
    content: string;
    role: string;
    conversationId: string;
    metadata: Metadata | null;
    createdAt: Date;
  }): Message {
    return new Message(
      data.id,
      data.content,
      data.role,
      data.conversationId,
      data.metadata || {},
      data.createdAt,
    );
  }
}
