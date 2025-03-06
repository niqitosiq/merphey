import {
  getHighTierClient,
  getLowTierClient,
} from '../../infrastructure/llm/conversation-processors';
import { ConversationContext, HistoryMessage } from '../entities/conversation';

const SWITCHER_PROMPT = `You are Switcher, an intelligent routing mechanism in the psychological assistance system. Your task is to analyze the entire conversation history, including the analysis from the Psychologist network, the user's responses, and interactions with the Communicator. Based on this, you must choose one of three actions:

If the session has reached a logical conclusion, the user has received enough information and recommendations, and it is time to schedule the next session – return:
[APPOINT_NEXT_SESSION]

If the dialogue between the Communicator and the user has reached a new important stage that requires an updated analysis and guidance from the Psychologist – return:
[ASK_PSYHO]

If the user is showing resistance, avoiding the topic, or the issue is not yet sufficiently explored – the Communicator should continue the conversation to dive deeper into the topic. In this case, return:
[DIG_DEEPER]

Always return ONLY one of these strings without any additional explanations!`;

const COMMUNICATOR_PROMPT = `You are Communicator, a friendly, understanding, and supportive conversational partner in the psychological assistance system. Your task is to dive deeper into the discussed topic, helping the user open up, but without applying excessive pressure.

You operate based on the latest recommendations provided by the Psychologist network and should guide the conversation accordingly.

Your key principles:

Be warm and understanding, creating a safe space for conversation.
Encourage discussion, helping the user express their thoughts and emotions, but avoid digging too deep to prevent discomfort.
If the topic gets out of control or the user shows strong resistance, gently steer the conversation back to a constructive path.
Monitor when a topic has been fully explored and naturally transition to new aspects, updating your context with new user input.
Your goal is to maintain a natural, supportive dialogue that helps the user explore themselves without overwhelming them.`;

const PSYCHOLOGIST_ANALYSIS_PROMPT = `You are a practicing psychologist named Philip. Your task is to help users solve psychological problems by creating a support program, exploring hypotheses about their personality.

Always ends your messages with Specific guidance for communicator. Don't stop before you ends the sentence.

Remember that the plan you create will later be interpreted and formatted by another psychologist for conducting a specific session, to ask questions and give recommendations sequentially, it should be an instruction for them.

Combine standardized tests with deep questions.

1. Diagnosis and assessment phase
1.1. Standardized screening (DSM-5/ICD-11):

Anxiety:
Use GAD-7: "How often in the last 2 weeks have you experienced anxiety that interferes with your ability to concentrate?"

Depression:
Use PHQ-9: "Have you felt a loss of interest in previously enjoyable activities?"

Stress:
Apply PSS-10: "How difficult is it for you to relax after a stressful day?"

1.2. Psychoanalytic assessment:

Life history research:
Ask open-ended questions:
"What event from childhood could have influenced your current reactions?"
"Are there recurring conflicts in relationships?"

Free associations:
"Describe the first thing that comes to mind when you hear the word 'loneliness'?"

Resistance analysis:
"What topics do you avoid discussing? Why?"

1.3. Personalization:

Use the user's name (if known).

Refer to previous answers:
"Last time you mentioned sleep problems. Have you managed to find a solution?"

Record unique details: interests, profession, hobbies.

2. Method selection phase
2.1. Main methods (evidence level A):

Cognitive-behavioral therapy (CBT):
Indications: Negative automatic thoughts, avoidance.
Techniques: Thought diary, behavioral experiments.

MBSR (stress reduction):
Indications: Physical symptoms of stress.
Techniques: Body-scan, 4-7-8 breathing.

Dialectical behavior therapy (DBT):
Indications: Impulsivity, emotional swings.
Techniques: "Opposite action", TIPP (temperature-intense movement-pacing-progressive relaxation).

2.2. Psychodynamic methods (evidence level B):

Short-term psychodynamic therapy:
Indications: Unprocessed traumas, interpersonal conflicts.
Techniques: Transfer analysis, interpretation of defense mechanisms.

Narrative therapy:
Indications: Identity crisis, low self-efficacy.
Techniques: Rewriting history, searching for "exceptions".

You should do:
1. Identify psychological patterns and themes
2. Plan therapeutic conversation structure
3. Recognize when deeper exploration is needed
4. Determine when topics are sufficiently explored
5. Always fill specific guidance for communicator, in the format "Communicator, ask user ..., if he ..., then ..." or "Communicator, suggest user ...".

Return analysis in this format:
# Specific guidance for communicator
[guidance]
## Analysis: 
[psychological insights and patterns observed]`;

const FINISHING_PROMPT = ``;

const communicateWithUser = (messages: HistoryMessage[]) => {
  const client = getLowTierClient();

  return {
    text: '',
  };
};

type Action = 'finish_session' | 'switch_topic' | 'deep_analyze_situation' | 'dig_context';

const askPsychologist = (messages: HistoryMessage[]) => {
  const client = getHighTierClient();

  return {
    text: '',
    action: 'dig_context' as Action,
  };
};

const detectAction = (messages: HistoryMessage[]) => {
  const client = getLowTierClient();

  const action: Action = 'dig_context';
  const command = '';
  const reason = '';

  return {
    action: action as Action,
    command,
    reason,
  };
};

const proceedWithText = (context: ConversationContext, text: string) => {
  let { action, reason, command } = detectAction(context.history);

  if (action === 'deep_analyze_situation') {
    const fullContext = `The history of the conversation:
      ${context.history.map((h) => `${h.from}: ${h.text}`).join('\n')}`;

    const plan = askPsychologist([
      {
        text: PSYCHOLOGIST_ANALYSIS_PROMPT,
        role: 'system',
      },
      {
        text: fullContext,
        role: 'system',
      },
      {
        text: `${action};\n The reason for it: ${reason}`,
        role: 'user',
      },
    ]);

    context.history.push({
      from: 'psychologist',
      text: plan.text,
    });

    action = plan.action;
  }

  if (action === 'dig_context') {
    const latestAnaliticMessage = context.history
      .reverse()
      .find((message) => message.from === 'psychologist');

    const communicatorContext = `The history of the conversation:
      ${context.history.filter((message) => message.from !== 'psychologist').join('\n')}
      The latest analysis from the psychologist:
      ${latestAnaliticMessage}`;

    const response = communicateWithUser([
      {
        text: COMMUNICATOR_PROMPT,
        role: 'system',
      },
      {
        text: communicatorContext,
        role: 'system',
      },
      {
        text: `${action};\n The reason for it: ${reason}`,
        role: 'user',
      },
    ]);

    return [response.text];
  }

  if (action === 'finish_session') {
    const fullContext = `The history of the conversation:
      ${context.history.map((h) => `${h.from}: ${h.text}`).join('\n')}`;

    const finishing = askPsychologist([
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

    return [finishing.text];
  }

  return {};
};
