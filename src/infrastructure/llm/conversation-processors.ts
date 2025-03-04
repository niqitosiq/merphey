import { AzureOpenAI } from 'openai';
import { ConversationContext } from '../../domain/entities/conversation';
import {
  INITIAL_ANALYSIS_PROMPT,
  QUESTION_GENERATION_PROMPT,
  CONVERSATION_PLAN_PROMPT,
  QUESTION_EXPLORATION_PROMPT,
  FINAL_ANALYSIS_PROMPT,
} from './prompts/conversation.prompts';
import { ChatCompletionMessageParam } from 'openai/resources';

interface ConversationStepProcessor {
  process: (client: AzureOpenAI, deployment: string, context: ConversationContext) => Promise<any>;
}

export class ConversationProcessors {
  static readonly initialAnalysis: ConversationStepProcessor = {
    process: async (client: AzureOpenAI, deployment: string, context: ConversationContext) => {
      const messages: ChatCompletionMessageParam[] = [
        { role: 'system', content: INITIAL_ANALYSIS_PROMPT },
        { role: 'user', content: context.initialProblem || '' },
      ];

      const result = await client.chat.completions.create({
        model: deployment,
        messages,
      });

      return result.choices[0]?.message?.content || 'Failed to process your message.';
    },
  };

  static readonly questionGeneration: ConversationStepProcessor = {
    process: async (client: AzureOpenAI, deployment: string, context: ConversationContext) => {
      const messages: ChatCompletionMessageParam[] = [
        { role: 'system', content: QUESTION_GENERATION_PROMPT },
        { role: 'user', content: context.analyzedProblem || '' },
      ];

      const result = await client.chat.completions.create({
        model: deployment,
        messages,
      });

      const content = result.choices[0]?.message?.content || '';
      return {
        questions: content
          .split('\n')
          .filter((line) => line.trim().startsWith('Q:'))
          .map((item) => item.trim()),
        points: content
          .split('\n')
          .filter((line) => line.trim().startsWith('P:'))
          .map((line) => line.trim()),
      };
    },
  };

  static readonly conversationPlan: ConversationStepProcessor = {
    process: async (client: AzureOpenAI, deployment: string, context: ConversationContext) => {
      const messages: ChatCompletionMessageParam[] = [
        { role: 'system', content: CONVERSATION_PLAN_PROMPT },
        { role: 'user', content: context.analyzedProblem || context.initialProblem || '' },
      ];

      const result = await client.chat.completions.create({
        model: deployment,
        messages,
        response_format: { type: 'json_object' },
      });

      const content = result.choices[0]?.message?.content || '{}';
      try {
        return JSON.parse(content);
      } catch (error) {
        console.error('Failed to parse conversation plan JSON:', error);
        return { mainTopics: [], recommendedDepth: 2 };
      }
    },
  };

  static readonly questionExploration: ConversationStepProcessor = {
    process: async (client: AzureOpenAI, deployment: string, context: ConversationContext) => {
      const messages: ChatCompletionMessageParam[] = [
        { role: 'system', content: QUESTION_EXPLORATION_PROMPT },
        { role: 'user', content: `Initial Problem: ${context.initialProblem}` },
      ];

      if (context.conversationHistory?.length) {
        messages.push(
          ...context.conversationHistory.map((msg) => ({
            role: msg.role as 'system' | 'user' | 'assistant',
            content: msg.content,
          })),
        );
      }

      if (context.currentQuestion) {
        messages.push({
          role: 'system',
          content: `Current Question: ${context.currentQuestion.text}\nContext: ${context.currentQuestion.explanation || ''}`,
        });
      }

      const result = await client.chat.completions.create({
        model: deployment,
        messages,
      });

      const response = result.choices[0]?.message?.content || '';
      const isComplete = response.includes('[QUESTION_COMPLETE:');
      const completionReason = isComplete
        ? response.match(/\[QUESTION_COMPLETE:[^\]]+\]\s*(.+)/)?.[1]
        : undefined;

      return {
        response: response.replace(/\[QUESTION_COMPLETE:[^\]]+\].*$/, '').trim(),
        isComplete,
        completionReason,
      };
    },
  };

  static readonly finalAnalysis: ConversationStepProcessor = {
    process: async (client: AzureOpenAI, deployment: string, context: ConversationContext) => {
      const formattedQA = (context.questionsAndAnswers || [])
        .map((qa) => `Question: ${qa.question}\nAnswer: ${qa.answer}`)
        .join('\n\n');

      const messages: ChatCompletionMessageParam[] = [
        { role: 'system', content: FINAL_ANALYSIS_PROMPT },
        {
          role: 'user',
          content: `Initial Problem: ${context.initialProblem || ''}\n\nQuestions and Answers:\n${formattedQA}`,
        },
      ];

      const result = await client.chat.completions.create({
        model: deployment,
        messages,
      });

      return result.choices[0]?.message?.content || 'Failed to generate analysis.';
    },
  };
}
