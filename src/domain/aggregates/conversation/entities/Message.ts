import { Message as PrismaMessage } from '@prisma/client';

import { Metadata, SessionProgress } from './types';

export class Message implements Omit<PrismaMessage, 'metadata'> {
  constructor(
    public readonly id: string,
    public readonly content: string,
    public readonly role: string,
    public readonly conversationId: string,
    public readonly metadata: Metadata,
    public readonly createdAt: Date,
  ) {}

  static createMessage(conversationId: string, content: string, metadata: Metadata): Message {
    return new Message(crypto.randomUUID(), content, 'user', conversationId, metadata, new Date());
  }

  static createAssistantMessage(
    conversationId: string,
    content: string,
    metadata: Metadata,
  ): Message {
    return new Message(
      crypto.randomUUID(),
      content,
      'assistant',
      conversationId,
      metadata,
      new Date(),
    );
  }
}
