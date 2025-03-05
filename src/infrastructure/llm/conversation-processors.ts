import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { ChatCompletionMessageParam } from 'openai/resources';
import { config } from '../config';
import {
  ConversationContext,
  CommunicatorTag,
  PsychologistTag,
  CommunicatorResponse,
  PsychologistResponse,
  ConversationStepType,
} from '../../domain/entities/conversation';
import {
  PSYCHOLOGIST_ANALYSIS_PROMPT,
  HOMEWORK_PROMPT,
  STORY_PROMPT,
  COMMUNICATOR_PROMPT,
  FINAL_ANALYSIS_PROMPT,
} from './prompts/conversation.prompts';
import { PsychologistAnalysis } from '../../domain/services/psychologist.service';

interface AIOptions {
  temperature: number;
  max_tokens: number;
  response_format?: { type: 'json_object' | 'text' };
}

class OpenAIProvider {
  private client: OpenAI;
  private model: string;

  constructor(model: string = 'gpt-3.5-turbo') {
    this.client = new OpenAI({
      apiKey: config.ai.openai!.apiKey,
      baseURL: config.ai.openai!.endpoint,
    });
    this.model = model;
  }

  async generateResponse(messages: ChatCompletionMessageParam[], options: AIOptions) {
    console.log('generateResponse', JSON.stringify(messages, null, '  '));
    const result = await this.client.chat.completions.create({
      model: this.model,
      messages,
      temperature: options.temperature,
      max_tokens: options.max_tokens,
      response_format: options.response_format ? { type: options.response_format.type } : undefined,
    });
    console.log('generateResponse!!!', JSON.stringify(result, null, '  '));

    return {
      content: result.choices[0]?.message?.content || '',
    };
  }
}

class GeminiProvider {
  private client: GoogleGenerativeAI;
  private model: string;

  constructor(model: string = 'gemini-2.0-flash') {
    this.client = new GoogleGenerativeAI(config.ai.gemini!.apiKey);
    this.model = model;
  }

  async generateResponse(messages: ChatCompletionMessageParam[], options: AIOptions) {
    console.log('generateResponse', JSON.stringify(messages, null, '  '));
    const model = this.client.getGenerativeModel({ model: this.model });

    const prompt = messages.map((m) => m.content).join('\n');
    const result = await model.generateContent(prompt);
    const response = await result.response;

    console.log('generateResponse!!!', JSON.stringify(response, null, '  '));
    return {
      content: response.text(),
    };
  }
}

interface AIClient {
  provider: OpenAIProvider | GeminiProvider;
}

const getAIProvider = (provider: 'openai' | 'gemini' = config.ai.provider, model?: string) => {
  if (provider === 'openai') {
    return new OpenAIProvider(model);
  }
  return new GeminiProvider(model);
};

const getLowTierClient = (): AIClient => {
  return {
    provider: getAIProvider('openai', 'google/gemini-2.0-flash-001'),
  };
};

const getHighTierClient = (): AIClient => {
  return {
    provider: getAIProvider('openai', 'deepseek/deepseek-r1'),
  };
};

function extractTags<T = CommunicatorTag>(text: string): T[] {
  const tagRegex = /\[(NEED_GUIDANCE|DEEP_EMOTION|RESISTANCE|CRISIS|TOPIC_CHANGE)\]/g;
  const tags: T[] = [];
  let match;

  while ((match = tagRegex.exec(text)) !== null) {
    tags.push(match[1] as T);
  }

  return tags;
}

export async function makeSuggestionOrAsk(
  context: ConversationContext,
): Promise<CommunicatorResponse> {
  const messages: ChatCompletionMessageParam[] = [
    {
      role: 'system',
      content: COMMUNICATOR_PROMPT,
    },
  ];

  if (context.conversationHistory)
    messages.push(
      ...context.conversationHistory?.map((m) => ({
        role: (m.role === 'psychologist' ? 'system' : m.role === 'user' ? 'user' : 'assistant') as
          | 'user'
          | 'assistant'
          | 'system',
        content: m.content,
      })),
    );

  const client = getLowTierClient();

  const result = await client.provider.generateResponse(messages, {
    temperature: 0.8,
    max_tokens: 300,
  });

  console.log('makeSuggestionOrAsk!!!', JSON.stringify([messages, result], null, '  '));

  const response = result.content || 'Could you tell me more about that?';
  const tags = extractTags(response);

  return {
    response: response.replace(/\[.*?\]/g, '').trim(), // Remove tags from response
    tags,
    role: 'communicator',
  };
}

export async function analyzeStep(context: ConversationContext): Promise<PsychologistResponse> {
  const messages: ChatCompletionMessageParam[] = [
    {
      role: 'system',
      content: PSYCHOLOGIST_ANALYSIS_PROMPT,
    },
  ];

  if (context.conversationHistory)
    messages.push(
      ...context.conversationHistory?.map((m) => ({
        role: (m.role === 'psychologist' || m.role === 'user' ? 'user' : 'assistant') as
          | 'user'
          | 'assistant'
          | 'system',
        content: m.content,
      })),
    );

  messages.push({
    role: 'user',
    content:
      context.currentQuestion?.text || 'Help me this situation above, I don\t know how to proceed',
  });

  const client = getHighTierClient();

  const { content } = await client.provider.generateResponse(messages, {
    temperature: 0.9,
    max_tokens: 10000,
  });

  const tags = extractTags<PsychologistTag>(content);

  return {
    response: content,
    tags,
    role: 'psychologist',
  };
}

export async function finalAnalyze(context: ConversationContext) {
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

  const client = getHighTierClient();

  const result = await client.provider.generateResponse(messages, {
    temperature: 0.7,
    max_tokens: 1000,
    response_format: { type: 'json_object' },
  });

  const content = JSON.parse(
    result.content.replace(/\`\`\`json/g, '').replace(/\`\`\`/g, '') || '{}',
  );
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
    tags: content.tags?.map((tag: string) => tag as PsychologistTag) || [],
  };
}

export async function generateHomework(context: ConversationContext) {
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
  const client = getHighTierClient();

  const result = await client.provider.generateResponse(messages, {
    temperature: 0.6,
    max_tokens: 500,
    response_format: { type: 'json_object' },
  });

  const content = JSON.parse(
    result.content.replace(/\`\`\`json/g, '').replace(/\`\`\`/g, '') || '{}',
  );
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

export async function generateStory(context: ConversationContext) {
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
  const client = getHighTierClient();

  const result = await client.provider.generateResponse(messages, {
    temperature: 0.9,
    max_tokens: 800,
    response_format: { type: 'json_object' },
  });

  const content = JSON.parse(
    result.content.replace(/\`\`\`json/g, '').replace(/\`\`\`/g, '') || '{}',
  );
  return {
    story: `${content.title}\n\n${content.story}`,
    role: 'communicator',
  };
}
