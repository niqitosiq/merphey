import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { ChatCompletionMessageParam } from 'openai/resources';
import { config } from '../config';

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
    console.log('Generating response with model', messages);
    const result = await this.client.chat.completions.create({
      model: this.model,
      messages,
      temperature: options.temperature,
      max_tokens: options.max_tokens,
      response_format: options.response_format ? { type: options.response_format.type } : undefined,
    });

    console.log('Generated response', result.choices);

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
    const model = this.client.getGenerativeModel({ model: this.model });

    const prompt = messages.map((m) => m.content).join('\n');
    const result = await model.generateContent(prompt);
    const response = await result.response;

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

export const getLowTierClient = (): AIClient => {
  return {
    provider: getAIProvider('openai', 'google/gemini-2.0-flash-001'),
  };
};

export const getHighTierClient = (): AIClient => {
  return {
    provider: getAIProvider('openai', 'deepseek/deepseek-r1'),
  };
};
