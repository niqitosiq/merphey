import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { ChatCompletionMessageParam } from 'openai/resources';
import { config } from '../config';
import { pipe } from 'fp-ts/function';
import * as O from 'fp-ts/Option';

export interface AIOptions {
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
    // console.log('Generating response with model', messages);
    const result = await this.client.chat.completions.create({
      model: this.model,
      messages,
      temperature: options.temperature,
      max_tokens: options.max_tokens,
      response_format: options.response_format ? { type: options.response_format.type } : undefined,
      provider: {
        data_collection: 'deny',
      },
    });

    // console.log('Generated response', result.choices);

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

type Provider = OpenAIProvider | GeminiProvider;
type ProviderType = 'openai' | 'gemini';

interface AIClient {
  provider: Provider;
}

const isOpenAIProvider = (provider: ProviderType): boolean => provider === 'openai';
const isGeminiProvider = (provider: ProviderType): boolean => provider === 'gemini';

const createOpenAIProvider = (model?: string): O.Option<OpenAIProvider> =>
  pipe(
    O.some(new OpenAIProvider(model)),
    O.map((provider) => {
      // console.log('Created OpenAI provider with model:', model);
      return provider;
    }),
  );

const createGeminiProvider = (model?: string): O.Option<GeminiProvider> =>
  pipe(
    O.some(new GeminiProvider(model)),
    O.map((provider) => {
      // console.log('Created Gemini provider with model:', model);
      return provider;
    }),
  );

const getAIProvider = (
  provider: ProviderType = config.ai.provider,
  model?: string,
): O.Option<Provider> =>
  pipe(
    O.of(provider),
    O.chain((p): O.Option<Provider> => {
      if (isOpenAIProvider(p)) {
        return pipe(
          createOpenAIProvider(model),
          O.map((provider): Provider => provider),
        );
      }
      return pipe(
        createGeminiProvider(model),
        O.map((provider): Provider => provider),
      );
    }),
  );

const createFallbackProvider = (model: string): Provider => new OpenAIProvider(model);

export const getLowTierClient = (): AIClient => ({
  provider: pipe(
    getAIProvider('openai', 'google/gemini-2.0-flash-001'),
    O.getOrElse(() => createFallbackProvider('google/gemini-2.0-flash-001')),
  ),
});

export const getHighTierClient = (): AIClient => ({
  provider: pipe(
    getAIProvider('openai', 'deepseek/deepseek-r1'),
    O.getOrElse(() => createFallbackProvider('deepseek/deepseek-r1')),
  ),
});
