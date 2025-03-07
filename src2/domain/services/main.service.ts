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

const isAskPsycho = (action: string): boolean => action === 'ASK_PSYCHO';
const isSessionEnding = (action: string): boolean =>
  action === 'FINISH_SESSION' || action === 'APPOINT_NEXT_SESSION';

const triggerDeepThink = (
  context: ConversationContext,
  reason: string,
  pushHistory: HistoryPusher,
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
    TE.map((plan) => {
      pushHistory({
        from: 'psychologist',
        text: `Please follow the guidance:
        ${plan.guidance};
        ${plan.text};`,
      });
      context.isThinking = false;
      return reason;
    }),
  );
};

const handleFinishingSession = (
  context: ConversationContext,
  pushHistory: HistoryPusher,
  typingHandler: TypingIndicator,
): TE.TaskEither<Error, string> => {
  const fullContext = `The history of the conversation:
    ${formatConversationHistory(context.history)}`;

  return pipe(
    finishSession([
      { text: fullContext, role: 'system' },
      { text: `Finish the session`, role: 'user' },
    ]),
    TE.map((finishing) => {
      pushHistory({
        from: 'psychologist',
        text: finishing.text,
      });
      return finishing.action;
    }),
  );
};

const handleActionResponse = (
  action: string,
  reason: string,
  context: ConversationContext,
  pushHistory: HistoryPusher,
): TE.TaskEither<Error, string> =>
  pipe(
    O.fromPredicate(isAskPsycho)(action),
    O.chain(() =>
      pipe(
        O.fromNullable(context.isThinking),
        O.fold(
          // If not thinking, start thinking
          () => O.some(true),
          // If already thinking, return none to skip
          (isThinking) => (isThinking ? O.none : O.some(true)),
        ),
      ),
    ),
    O.map(() => {
      context.isThinking = true;
      triggerDeepThink(context, action, pushHistory)();

      pushHistory({
        from: 'psychologist',
        text: `I'm working on the analysis. Tell user that you need to think deeper, and proceed with existing guidance from the history, focus on other tasks meanwhile.`,
      });

      return TE.right(action);
    }),
    O.getOrElse(() => {
      if (context.isThinking) {
        pushHistory({
          from: 'psychologist',
          text: `I'm still analyzing the previous context. Let's continue with our current discussion while I process that.`,
        });
      }
      return TE.right(action);
    }),
  );

export const proceedWithText = (
  context: ConversationContext,
  pushHistory: HistoryPusher,
  typingHandler: TypingIndicator,
  reply: UserReply,
): TE.TaskEither<Error, string[]> => {
  typingHandler();

  return pipe(
    detectAction(context.history),
    TE.chain(({ action, reason }) => handleActionResponse(action, reason, context, pushHistory)),
    TE.chain((action) =>
      pipe(
        O.fromPredicate(isSessionEnding)(action),
        O.map(() => handleFinishingSession(context, pushHistory, typingHandler)),
        O.getOrElse(() => TE.right(action)),
      ),
    ),
    TE.chain(() => {
      typingHandler();
      const communicatorContext = `The history of the conversation:
        ${formatConversationHistory(context.history)}`;

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
): Promise<string[]> => {
  const result = await pipe(
    proceedWithText(context, pushHistory, typingHandler, reply),
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
