import {
  getHighTierClient,
  getLowTierClient,
} from '../../infrastructure/llm/conversation-processors';
import { ConversationContext, HistoryMessage } from '../entities/conversation';

// Import prompts and their types from separate files
import { SWITCHER_PROMPT, SwitcherResponse } from './prompts/switcher.prompt';
import { COMMUNICATOR_PROMPT, CommunicatorResponse } from './prompts/communicator.prompt';
import { PSYCHOLOGIST_ANALYSIS_PROMPT, PsychologistResponse } from './prompts/psychologist.prompt';
import { FINISHING_PROMPT, FinishingResponse } from './prompts/finishing.prompt';

const communicateWithUser = async (messages: HistoryMessage[]): Promise<CommunicatorResponse> => {
  const client = getLowTierClient();

  // Call the AI with proper response format setting
  const result = await client.provider.generateResponse(
    messages.map((m) => ({ role: m.role || 'user', content: m.text })),
    {
      temperature: 0.8,
      max_tokens: 1000,
      response_format: { type: 'json_object' },
    },
  );

  // Parse JSON response
  try {
    const parsedResponse = JSON.parse(result.content) as CommunicatorResponse;
    return parsedResponse;
  } catch (error) {
    console.error('Failed to parse communicator response as JSON:', error);
    // Return fallback response if parsing fails
    return {
      text: result.content || "I'm not sure how to respond to that.",
      nextAction: 'ASK_PSYCHO',
      reason: 'Failed to generate proper response',
    };
  }
};

const askPsychologist = async (messages: HistoryMessage[]): Promise<PsychologistResponse> => {
  const client = getHighTierClient();

  // Call the AI with proper response format setting
  const result = await client.provider.generateResponse(
    messages.map((m) => ({ role: m.role || 'user', content: m.text })),
    {
      temperature: 0.9,
      max_tokens: 1000,
      response_format: { type: 'json_object' },
    },
  );

  // Parse JSON response
  try {
    const parsedResponse = JSON.parse(result.content) as PsychologistResponse;
    return parsedResponse;
  } catch (error) {
    console.error('Failed to parse psychologist response as JSON:', error);
    // Return fallback response if parsing fails
    return {
      text: result.content || 'Analysis could not be completed.',
      guidance: 'Please ask the user to provide more information about their situation.',
      action: 'DIG_DEEPER',
    };
  }
};

const detectAction = async (messages: HistoryMessage[]): Promise<SwitcherResponse> => {
  const client = getLowTierClient();

  // Call the AI with proper response format setting
  const result = await client.provider.generateResponse(
    [
      { role: 'system', content: SWITCHER_PROMPT },
      ...messages.map((m) => ({ role: m.role || 'user', content: m.text })),
    ],
    {
      temperature: 0.5,
      max_tokens: 500,
      response_format: { type: 'json_object' },
    },
  );

  console.log('Switcher response:', result.content);

  // Parse JSON response
  try {
    const parsedResponse = JSON.parse(result.content) as SwitcherResponse;
    return parsedResponse;
  } catch (error) {
    console.error('Failed to parse switcher response as JSON:', error);
    // Return fallback response if parsing fails
    return {
      action: 'ASK_PSYCHO',
      reason: 'Failed to determine next action',
    };
  }
};

const finishSession = async (messages: HistoryMessage[]): Promise<FinishingResponse> => {
  const client = getHighTierClient();

  // Call the AI with proper response format setting
  const result = await client.provider.generateResponse(
    [
      { role: 'system', content: FINISHING_PROMPT },
      ...messages.map((m) => ({ role: m.role || 'user', content: m.text })),
    ],
    {
      temperature: 0.6,
      max_tokens: 1500,
      response_format: { type: 'json_object' },
    },
  );

  // Parse JSON response
  try {
    const parsedResponse = JSON.parse(result.content) as FinishingResponse;
    return parsedResponse;
  } catch (error) {
    console.error('Failed to parse finishing response as JSON:', error);
    // Return fallback response if parsing fails
    return {
      text: result.content || 'Thank you for your time today.',
      recommendations: 'Consider practicing self-care regularly.',
      nextSteps: 'Feel free to schedule another session if needed.',
      action: 'FINISH_SESSION',
      reason: 'Failed to generate proper closing response',
    };
  }
};

export const proceedWithText = async (context: ConversationContext, typingHandler: () => void) => {
  // First, detect what action to take
  typingHandler();
  const { action, reason } = await detectAction(context.history);

  let psychoActions;

  if (action === 'ASK_PSYCHO') {
    const fullContext = `The history of the conversation:
      ${context.history.map((h) => `${h.from}: ${h.text}`).join('\n')}`;

    typingHandler();
    // Get analysis from psychologist
    const plan = await askPsychologist([
      {
        text: PSYCHOLOGIST_ANALYSIS_PROMPT,
        role: 'system',
      },
      {
        text: fullContext,
        role: 'system',
      },
      {
        text: `Please help me with this user situation;\n The reason for it: ${reason}`,
        role: 'user',
      },
    ]);

    context.history.push({
      from: 'psychologist',
      text: `Please follow the guidance:
        ${plan.guidance};
        ${plan.text};
      `,
    });

    psychoActions = plan.action;
  }

  if (psychoActions === 'FINISH_SESSION' || action === 'APPOINT_NEXT_SESSION') {
    const fullContext = `The history of the conversation:
      ${context.history.map((h) => `${h.from}: ${h.text}`).join('\n')}`;

    typingHandler();
    const finishing = await finishSession([
      {
        text: FINISHING_PROMPT,
        role: 'system',
      },
      {
        text: fullContext,
        role: 'system',
      },
      {
        text: `Finish the session`,
        role: 'user',
      },
    ]);

    context.history.push({
      from: 'psychologist',
      text: finishing.text,
    });

    typingHandler();

    psychoActions = finishing.action;
  }

  const latestAnalyticMessage = context.history
    .filter((message) => message.from === 'psychologist')
    .pop();

  const communicatorContext = `The history of the conversation:
      ${context.history
        .filter((message) => message.from !== 'psychologist')
        .map((m) => `${m.from}: ${m.text}`)
        .join('\n')}
      ${latestAnalyticMessage ? `The latest analysis from the psychologist: ${latestAnalyticMessage.text}` : ''}`;

  typingHandler();
  // Get response from communicator
  const response = await communicateWithUser([
    {
      text: COMMUNICATOR_PROMPT,
      role: 'system',
    },
    {
      text: communicatorContext,
      role: 'system',
    },
    {
      text: `${psychoActions || action};\n The reason for it: ${reason}`,
      role: 'user',
    },
  ]);

  typingHandler();
  return [response.text];
};
