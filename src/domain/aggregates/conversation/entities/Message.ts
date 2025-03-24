import { Message as PrismaMessage } from '@prisma/client'
import { v4 as uuidv4 } from 'uuid'
import { Metadata } from './types'

export class Message implements Omit<PrismaMessage, 'metadata'> {
	constructor(
		public readonly id: string,
		public readonly content: string,
		public readonly role: string,
		public readonly conversationId: string,
		public readonly metadata: Metadata,
		public readonly createdAt: Date
	) {}

	static createMessage(
		conversationId: string,
		content: string,
		metadata: Metadata
	): Message {
		return new Message(
			uuidv4(),
			content,
			'user',
			conversationId,
			metadata,
			new Date()
		)
	}

	static createAssistantMessage(
		conversationId: string,
		content: string,
		metadata: Metadata
	): Message {
		return new Message(
			uuidv4(),
			content,
			'assistant',
			conversationId,
			metadata,
			new Date()
		)
	}
}
