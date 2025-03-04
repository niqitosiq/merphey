import OpenAI from 'openai';
import { ChatCompletionMessageParam } from 'openai/resources';
import {
  ConversationContext,
  CommunicatorTag,
  PsychologistTag,
  CommunicatorResponse,
  PsychologistResponse,
} from '../../domain/entities/conversation';
import {
  PSYCHOLOGIST_ANALYSIS_PROMPT,
  HOMEWORK_PROMPT,
  STORY_PROMPT,
  COMMUNICATOR_PROMPT,
  FINAL_ANALYSIS_PROMPT,
} from './prompts/conversation.prompts';

function extractTags(text: string): CommunicatorTag[] {
  const tags: CommunicatorTag[] = [];
  const tagRegex = /\[(NEED_GUIDANCE|DEEP_EMOTION|RESISTANCE|CRISIS|TOPIC_CHANGE)\]/g;
  let match;

  while ((match = tagRegex.exec(text)) !== null) {
    tags.push(match[1] as CommunicatorTag);
  }

  return tags;
}

export async function makeSuggestionOrAsk(
  client: OpenAI,
  deployment: string,
  context: ConversationContext,
  analysis?: PsychologistResponse,
): Promise<CommunicatorResponse> {
  const messages: ChatCompletionMessageParam[] = [
    {
      role: 'system',
      content: COMMUNICATOR_PROMPT,
    },
    {
      role: 'user',
      content: analysis?.analysis ? `Analysis from psychologist: ${analysis?.analysis || ''}` : '',
    },
    {
      role: 'user',
      content: `Context: ${context.conversationHistory?.map((m) => `${m.role}: ${m.content}`).join('\n')}\n\nCurrent question or topic: ${context.currentQuestion?.text}`,
    },
  ];

  const result = await client.chat.completions.create({
    model: deployment,
    messages,
    temperature: 0.8,
    max_tokens: 300,
  });

  console.info('makeSuggestionOrAsk', { result });
  const response = result.choices[0]?.message?.content || 'Could you tell me more about that?';
  const tags = extractTags(response);

  return {
    response: response.replace(/\[.*?\]/g, '').trim(), // Remove tags from response
    tags,
    role: 'communicator',
  };
}

export async function analyzeStep(
  client: OpenAI,
  deployment: string,
  context: ConversationContext,
): Promise<PsychologistResponse> {
  const messages: ChatCompletionMessageParam[] = [
    {
      role: 'system',
      content: PSYCHOLOGIST_ANALYSIS_PROMPT,
    },
    {
      role: 'user',
      content: `Full conversation history:\n${context.conversationHistory?.map((m) => `${m.role}: ${m.content}`).join('\n')}\n\nCurrent topic: ${context.currentQuestion?.text || 'Initial conversation'}`,
    },
  ];

  const result = await client.chat.completions.create({
    model: deployment,
    messages,
    temperature: 0.7,
    max_tokens: 800,
    response_format: { type: 'json_object' },
  });

  const content = JSON.parse(result.choices[0]?.message?.content || '{}');
  return {
    analysis: {
      ...content,
      tags: content.tags?.map((tag: string) => tag as PsychologistTag) || [],
    },
    role: 'psychologist',
  };
}

export async function finalAnalyze(
  client: OpenAI,
  deployment: string,
  context: ConversationContext,
) {
  const messages: ChatCompletionMessageParam[] = [
    {
      role: 'system',
      content: FINAL_ANALYSIS_PROMPT,
    },
    {
      role: 'user',
      content: `Full conversation history:\n${context.conversationHistory?.map((m) => `${m.role}: ${m.content}`).join('\n')}`,
    },
  ];

  const result = await client.chat.completions.create({
    model: deployment,
    messages,
    temperature: 0.7,
    max_tokens: 1000,
    response_format: { type: 'json_object' },
  });

  const content = JSON.parse(result.choices[0]?.message?.content || '{}');
  return {
    analysis: `
Session Analysis:
${content.insights?.join('\n')}

Progress:
${content.progress}

Future Focus Areas:
${content.futureAreas?.join('\n')}

Recommendations:
${content.recommendations?.join('\n')}
    `.trim(),
    role: 'psychologist',
  };
}

export async function generateHomework(
  client: OpenAI,
  deployment: string,
  context: ConversationContext,
) {
  const messages: ChatCompletionMessageParam[] = [
    {
      role: 'system',
      content: HOMEWORK_PROMPT,
    },
    {
      role: 'user',
      content: `Session summary and insights:\n${context.conversationHistory?.map((m) => `${m.role}: ${m.content}`).join('\n')}`,
    },
  ];

  const result = await client.chat.completions.create({
    model: deployment,
    messages,
    temperature: 0.6,
    max_tokens: 500,
    response_format: { type: 'json_object' },
  });

  const content = JSON.parse(result.choices[0]?.message?.content || '{}');
  return {
    homework: `
Purpose: ${content.purpose}

Task: ${content.task}

What to observe:
${content.reflectionPoints?.join('\n')}

Success indicators:
${content.successIndicators?.join('\n')}

Timeframe: ${content.timeframe}
    `.trim(),
    role: 'psychologist',
  };
}

export async function generateStory(
  client: OpenAI,
  deployment: string,
  context: ConversationContext,
) {
  const messages: ChatCompletionMessageParam[] = [
    {
      role: 'system',
      content: STORY_PROMPT,
    },
    {
      role: 'user',
      content: `Session themes and insights:\n${context.conversationHistory?.map((m) => `${m.role}: ${m.content}`).join('\n')}`,
    },
  ];

  const result = await client.chat.completions.create({
    model: deployment,
    messages,
    temperature: 0.9,
    max_tokens: 800,
    response_format: { type: 'json_object' },
  });

  const content = JSON.parse(result.choices[0]?.message?.content || '{}');
  return {
    story: `${content.title}\n\n${content.story}`,
    role: 'communicator',
  };
}
