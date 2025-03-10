import { pipe } from 'fp-ts/function';
import * as TE from 'fp-ts/TaskEither';
import { ConversationContext } from '../entities/conversation';
import { PSYCHOLOGIST_ANALYSIS_PROMPT } from './prompts/psychologist.prompt';
import { COMMUNICATOR_PROMPT } from './prompts/communicator.prompt';
import { HistoryPusher, TypingIndicator, UserReply, formatConversationHistory } from './types';
import {
  askPsychologist,
  communicateWithUser,
  detectAction,
  finishSession,
} from './conversation-services';
import { FINISHING_PROMPT } from './prompts/finishing.prompt';

const isAskPsychoImmediately = (action: string): boolean => action === 'ASK_PSYCHO_IMMEDIATLY';
const isAskPsychoBackground = (action: string): boolean => action === 'ASK_PSYCHO_BACKGROUND';
const isAnyPsychoAction = (action: string): boolean =>
  isAskPsychoImmediately(action) || isAskPsychoBackground(action);
const isSessionEnding = (action: string): boolean =>
  action === 'FINISH_SESSION' || action === 'APPOINT_NEXT_SESSION';

// Define a type for the parameters
export interface ProceedWithTextParams {
  context: ConversationContext;
  pushHistory: HistoryPusher;
  typingHandler: TypingIndicator;
  reply: UserReply;
  updateIsThinking: (isThinking: boolean) => Promise<void>;
}

const triggerDeepThink = (
  props: ProceedWithTextParams & { prompt: string; isImmediate: boolean },
): TE.TaskEither<Error, string> => {
  const { context, prompt, pushHistory, reply, updateIsThinking, isImmediate } = props;
  const fullContext = `The history of the conversation:
  ${formatConversationHistory(context.history)}`;

  return pipe(
    askPsychologist([
      { text: PSYCHOLOGIST_ANALYSIS_PROMPT, role: 'system' },
      { text: fullContext, role: 'system' },
      {
        text: prompt,
        role: 'user',
      },
    ]),
    TE.chain((plan) => {
      if (isImmediate) {
        // Execute the TaskEither and return the string result
        pushHistory({
          from: 'psychologist',
          text: `Please follow the guidance:
          ${plan.prompt};
          ${plan.text};`,
        });
        updateIsThinking(false);
        return TE.right(plan.text);
      } else {
        pushHistory({
          from: 'psychologist',
          text: `Please follow the guidance:
          ${plan.prompt};
          ${plan.text};`,
        });
        updateIsThinking(false);
        return TE.right(prompt);
      }
    }),
  );
};

const handleFinishingSession = (
  props: ProceedWithTextParams & { prompt: string },
): TE.TaskEither<Error, string> => {
  const { context, pushHistory, typingHandler, prompt, reply } = props;
  const fullContext = `The history of the conversation:
    ${formatConversationHistory(context.history)}`;

  return pipe(
    finishSession([
      { text: FINISHING_PROMPT, role: 'system' },
      { text: fullContext, role: 'system' },
      { text: prompt, role: 'user' },
    ]),
    TE.map((finishing) => {
      pushHistory({
        from: 'psychologist',
        text: `
          Action: ${finishing.action};
          text: ${finishing.text};
          Next steps: ${finishing.nextSteps};
          Reason: ${finishing.reason};
          Recomendations: ${finishing.recommendations};
        `,
      });

      // reply(`
      //   ${finishing.text}
      //   ${finishing.nextSteps}
      //   ${finishing.recommendations}

      //   Reason: ${finishing.reason};
      // `);
      return 'COMMUNICATE';
    }),
  );
};

const handleActionResponse = (
  props: ProceedWithTextParams & { action: string; prompt: string },
): TE.TaskEither<Error, { prompt: string }> => {
  const { action, prompt, context, reply, pushHistory, updateIsThinking } = props;

  // Check if we should ask the psychologist
  if (isAnyPsychoAction(action) && !context.isThinking) {
    updateIsThinking(true);
    const isImmediate = isAskPsychoImmediately(action);

    if (isImmediate) {
      console.log('Asking psychologist immediately');
      // For immediate analysis, wait for the psychologist's response
      return pipe(
        triggerDeepThink({
          context,
          prompt,
          pushHistory,
          reply,
          updateIsThinking,
          typingHandler: props.typingHandler,
          isImmediate,
        }),
        TE.map((prompt) => ({
          prompt,
        })),
      );
    } else {
      // For background analysis, trigger but don't wait
      triggerDeepThink({
        context,
        prompt,
        pushHistory,
        reply,
        updateIsThinking,
        typingHandler: props.typingHandler,
        isImmediate,
      })();

      return TE.right({
        prompt: `I'm working on the analysis in the background. Proceed with existing guidance from the history.`,
      });
    }
  }

  // If we're already thinking, just continue
  if (context.isThinking) {
    return TE.right({
      prompt: `I'm still analyzing the previous context. Let's continue with our current discussion while I process that.`,
    });
  }

  return TE.right({
    prompt,
  });
};

export const proceedWithText = (props: ProceedWithTextParams): TE.TaskEither<Error, string[]> => {
  const { context, pushHistory, typingHandler, reply, updateIsThinking } = props;
  typingHandler();

  return pipe(
    detectAction(context.history),
    TE.chain(({ action, prompt }) =>
      handleActionResponse({
        context,
        pushHistory,
        typingHandler,
        reply,
        updateIsThinking,
        action,
        prompt,
      }),
    ),
    // () => detectAction(context.history),
    TE.chain(({ prompt }) => {
      // Otherwise, continue with normal flow
      typingHandler();
      const communicatorContext = `The history of the conversation:
        ${formatConversationHistory(context.history.slice(-30))}
        `;

      return pipe(
        communicateWithUser([
          { text: COMMUNICATOR_PROMPT, role: 'system' },
          { text: communicatorContext, role: 'system' },
          {
            text: prompt,
            role: 'user',
          },
        ]),
        TE.map((response) => [response.text]),
      );
    }),
  );
};

export const proceedWithTextSimple = async (props: ProceedWithTextParams): Promise<string[]> => {
  const result = await pipe(
    proceedWithText(props),
    TE.fold(
      (error) => {
        console.error('Error in proceedWithText:', error);
        return () => Promise.resolve(['Sorry, something went wrong. Please try again later.']);
      },
      (messages) => () => Promise.resolve(messages),
    ),
  )();

  return result;
};
