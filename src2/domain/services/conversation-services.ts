import { pipe } from 'fp-ts/function';
import * as TE from 'fp-ts/TaskEither';
import {
  getHighTierClient,
  getLowTierClient,
} from '../../infrastructure/llm/conversation-processors';
import { HistoryMessage } from '../entities/conversation';
import { COMMUNICATOR_PROMPT, CommunicatorResponse } from './prompts/communicator.prompt';
import { PSYCHOLOGIST_ANALYSIS_PROMPT, PsychologistResponse } from './prompts/psychologist.prompt';
import { SWITCHER_PROMPT, SwitcherResponse } from './prompts/switcher.prompt';
import { FINISHING_PROMPT, FinishingResponse } from './prompts/finishing.prompt';
import { generateLlmResponse } from './llm-utils';
import { formatConversationHistory, mapMessagesToLlmFormat } from './types';

export const communicateWithUser = (
  messages: HistoryMessage[],
): TE.TaskEither<Error, CommunicatorResponse> => {
  const fallbackResponse: CommunicatorResponse = {
    text: "I'm not sure how to respond to that.",
    reason: 'Failed to generate proper response',
  };

  return generateLlmResponse<CommunicatorResponse>(
    getLowTierClient(),
    mapMessagesToLlmFormat(messages),
    {
      temperature: 0.8,
      max_tokens: 1000,
      response_format: { type: 'json_object' },
    },
    fallbackResponse,
  );
};

export const askPsychologist = (
  messages: HistoryMessage[],
): TE.TaskEither<Error, PsychologistResponse> => {
  const fallbackResponse: PsychologistResponse = {
    text: 'Analysis could not be completed.',
    prompt: 'Please ask the user to provide more information about their situation.',
    action: 'COMMUNICATE',
  };

  return generateLlmResponse<PsychologistResponse>(
    getHighTierClient(),
    mapMessagesToLlmFormat(messages),
    {
      temperature: 0.9,
      max_tokens: 2000,
      response_format: { type: 'json_object' },
    },
    fallbackResponse,
  );
};

export const detectAction = (
  messages: HistoryMessage[],
  shouldProceedWithCommunicate: boolean,
): TE.TaskEither<Error, SwitcherResponse> => {
  const fallbackResponse: SwitcherResponse = {
    action: 'ASK_PSYCHO_IMMEDIATLY',
    prompt: 'Failed to determine next action',
  };

  console.log('detecting');
  console.log('latest:', [
    { role: 'system', content: SWITCHER_PROMPT },
    {
      role: 'system',
      content: `latest guidance from psychologist: "${messages.filter((m) => m.from === 'psychologist' && m.text.includes('follow the guidance')).pop()?.text || 'No messages yet'}"`,
    },
    {
      role: 'system',
      content: `The history of the conversation:
              ${formatConversationHistory(messages.filter((m) => m.from !== 'psychologist').slice(-30))}`,
    },
    {
      role: 'user',
      content: shouldProceedWithCommunicate
        ? 'Analyzing in progress, please proceed only with communicate'
        : 'Proceed with user',
    },
  ]);

  return pipe(
    generateLlmResponse<SwitcherResponse>(
      getLowTierClient(),
      [
        { role: 'system', content: SWITCHER_PROMPT },
        {
          role: 'system',
          content: `The history of the conversation:
                ${formatConversationHistory(messages.filter((m) => m.from !== 'psychologist').slice(-30))}`,
        },
        {
          role: 'system',
          content: `latest guidance from psychologist: "${messages.filter((m) => m.from === 'psychologist' && m.text.includes('follow the guidance')).pop()?.text || 'No messages yet'}"`,
        },
        {
          role: 'user',
          content: shouldProceedWithCommunicate
            ? 'Analyzing in progress, please proceed only with communicate'
            : 'Proceed with user',
        },
      ],
      {
        temperature: 0.5,
        max_tokens: 500,
        response_format: { type: 'json_object' },
      },
      fallbackResponse,
    ),
    TE.map((result) => {
      console.log('Switcher response:', result);
      return result;
    }),
  );
};

export const finishSession = (
  messages: HistoryMessage[],
): TE.TaskEither<Error, FinishingResponse> => {
  const fallbackResponse: FinishingResponse = {
    text: 'Thank you for your time today.',
    recommendations: 'Consider practicing self-care regularly.',
    nextSteps: 'Feel free to schedule another session if needed.',
    action: 'FINISH_SESSION',
    reason: 'Failed to generate proper closing response',
  };

  return generateLlmResponse<FinishingResponse>(
    getHighTierClient(),
    [{ role: 'system', content: FINISHING_PROMPT }, ...mapMessagesToLlmFormat(messages)],
    {
      temperature: 0.6,
      max_tokens: 2000,
      response_format: { type: 'json_object' },
    },
    fallbackResponse,
  );
};
