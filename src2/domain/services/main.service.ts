import { pipe } from 'fp-ts/function';
import * as TE from 'fp-ts/TaskEither';
import * as O from 'fp-ts/Option';
import { ConversationContext, HistoryMessage } from '../entities/conversation';
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

const triggerDeepThink = (
  context: ConversationContext,
  reason: string,
  pushHistory: HistoryPusher,
  reply: UserReply,
  updateIsThinking: (isThinking: boolean) => Promise<void>,
  isImmediate: boolean,
): TE.TaskEither<Error, string> => {
  const fullContext = `The history of the conversation:
  ${formatConversationHistory(context.history)}`;

  return pipe(
    askPsychologist([
      { text: PSYCHOLOGIST_ANALYSIS_PROMPT, role: 'system' },
      { text: fullContext, role: 'system' },
      {
        text: `Please help me with this user situation;\n The reason for it: ${reason}`,
        role: 'user',
      },
    ]),
    TE.chain((plan) => {
      if (isImmediate) {
        // Execute the TaskEither and return the string result
        pushHistory({
          from: 'psychologist',
          text: `Please follow the guidance:
          ${plan.guidance};
          ${plan.text};`,
        });
        updateIsThinking(false);
        return TE.right(plan.text);
      } else {
        pushHistory({
          from: 'psychologist',
          text: `Please follow the guidance:
          ${plan.guidance};
          ${plan.text};`,
        });
        updateIsThinking(false);
        return TE.right(reason);
      }
    }),
  );
};

const handleFinishingSession = (
  context: ConversationContext,
  pushHistory: HistoryPusher,
  typingHandler: TypingIndicator,
  reply: UserReply,
): TE.TaskEither<Error, string> => {
  const fullContext = `The history of the conversation:
    ${formatConversationHistory(context.history)}`;

  return pipe(
    finishSession([
      { text: FINISHING_PROMPT, role: 'system' },
      { text: fullContext, role: 'system' },
      { text: `Finish the session`, role: 'user' },
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
      return 'DIG_DEEPER';
    }),
  );
};

const handleActionResponse = (
  action: string,
  reason: string,
  context: ConversationContext,
  reply: UserReply,
  pushHistory: HistoryPusher,
  updateIsThinking: (isThinking: boolean) => Promise<void>,
): TE.TaskEither<Error, { action: string; shouldProceed: boolean }> => {
  // Check if we should ask the psychologist
  if (isAnyPsychoAction(action) && !context.isThinking) {
    updateIsThinking(true);
    const isImmediate = isAskPsychoImmediately(action);

    if (isImmediate) {
      // For immediate analysis, wait for the psychologist's response
      return pipe(
        triggerDeepThink(context, reason, pushHistory, reply, updateIsThinking, isImmediate),
        TE.map(() => ({
          action,
          shouldProceed: false, // We can proceed since we've awaited the analysis
        })),
      );
    } else {
      // For background analysis, trigger but don't wait
      triggerDeepThink(context, reason, pushHistory, reply, updateIsThinking, isImmediate)();

      // Add a message for background analysis only
      pushHistory({
        from: 'psychologist',
        text: `I'm working on the analysis in the background. Proceed with existing guidance from the history.`,
      });

      return TE.right({
        action,
        shouldProceed: true,
      });
    }
  }

  // If we're already thinking, just continue
  if (context.isThinking) {
    pushHistory({
      from: 'psychologist',
      text: `I'm still analyzing the previous context. Let's continue with our current discussion while I process that.`,
    });
  }

  return TE.right({
    action,
    shouldProceed: true,
  });
};

export const proceedWithText = (
  context: ConversationContext,
  pushHistory: HistoryPusher,
  typingHandler: TypingIndicator,
  reply: UserReply,
  updateIsThinking: (isThinking: boolean) => Promise<void>,
): TE.TaskEither<Error, string[]> => {
  typingHandler();

  return pipe(
    detectAction(context.history),
    TE.chain(({ action, reason }) =>
      handleActionResponse(action, reason, context, reply, pushHistory, updateIsThinking),
    ),
    TE.chain(({ action }) => {
      return pipe(
        O.fromPredicate(isSessionEnding)(action),
        O.map(() => handleFinishingSession(context, pushHistory, typingHandler, reply)),
        O.getOrElse(() => TE.right(action)),
      );
    }),
    TE.chain(() => {
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
            text: `Proceed with the user, using the latest guidance from psychologist`,
            role: 'user',
          },
        ]),
        TE.map((response) => [response.text]),
      );
    }),
  );
};

export const proceedWithTextSimple = async (
  context: ConversationContext,
  pushHistory: HistoryPusher,
  typingHandler: TypingIndicator,
  reply: UserReply,
  updateIsThinking: (isThinking: boolean) => Promise<void>,
): Promise<string[]> => {
  const result = await pipe(
    proceedWithText(context, pushHistory, typingHandler, reply, updateIsThinking),
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
