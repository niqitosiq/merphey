import { pipe } from 'fp-ts/function';
import * as E from 'fp-ts/Either';
import * as TE from 'fp-ts/TaskEither';
import {
  AIOptions,
  getHighTierClient,
  getLowTierClient,
} from '../../infrastructure/llm/conversation-processors';
import { ChatCompletionMessageParam } from 'openai/resources';

// Safe JSON parsing with Either
export const safeParseJson = <T>(content: string, fallback: T): E.Either<Error, T> => {
  try {
    return E.right(JSON.parse(content) as T);
  } catch (error) {
    // try to remove ```json from the beginning and end of the string
    const guidance = content.replace(/^```json\n/, '').replace(/\n```$/, '');

    try {
      console.error('Failed to parse JSON response:', error);

      console.log('Trying to parse guidance:', guidance);
      return E.right(JSON.parse(guidance) as T);
    } catch (error) {
      console.error('Failed to parse JSON response:', error);
    }

    return E.right(fallback as T); // Using right for fallback to maintain flow
  }
};

export const generateLlmResponse = <T>(
  client: ReturnType<typeof getHighTierClient | typeof getLowTierClient>,
  messages: Array<ChatCompletionMessageParam>,
  config: AIOptions,
  fallback: T,
): TE.TaskEither<Error, T> =>
  pipe(
    TE.tryCatch(
      () => client.provider.generateResponse(messages, config),
      (error) => new Error(String(error)),
    ),
    TE.chain((result) => TE.fromEither(safeParseJson(result.content, fallback))),
  );
