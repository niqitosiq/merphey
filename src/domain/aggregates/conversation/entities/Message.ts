import { Message as PrismaMessage } from '@prisma/client';

export class Message implements Omit<PrismaMessage, 'metadata'> {
  constructor(
    public readonly id: string,
    public readonly content: string,
    public readonly role: string,
    public readonly conversationId: string,
    public readonly metadata: Record<string, any> | null,
    public readonly createdAt: Date,
  ) {}

  static createUserMessage(
    conversationId: string,
    content: string,
    metadata?: Record<string, any>,
  ): Message {
    return new Message(
      crypto.randomUUID(),
      content,
      'user',
      conversationId,
      metadata || null,
      new Date(),
    );
  }

  static createAssistantMessage(
    conversationId: string,
    content: string,
    metadata?: Record<string, any>,
  ): Message {
    return new Message(
      crypto.randomUUID(),
      content,
      'assistant',
      conversationId,
      metadata || null,
      new Date(),
    );
  }
}
