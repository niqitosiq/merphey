import { Message } from 'src/domain/aggregates/conversation/entities/Message';
import {
  ConversationContext,
  UserMessage,
} from 'src/domain/aggregates/conversation/entities/types';
import { TherapeuticPlan } from 'src/domain/aggregates/therapy/entities/TherapeuticPlan';

import {
  mapCurrentGoalsToString,
  mapGoalsToString,
  mapInsightsToString,
  mapMessagesToString,
} from './utils';

interface CognitiveAnalysisPromptData {
  message: Message;
  plan: TherapeuticPlan | null;
  history?: UserMessage[];
}

export const buildCognitiveAnalysisPrompt = ({
  message,
  plan,
  history,
}: CognitiveAnalysisPromptData): string => {
  const currentGoals = plan?.getCurrentGoals() || [];

  // Extract plan content details
  const planContent = plan?.currentVersion?.getContent();

  // Format goals using utility function
  const goals = mapGoalsToString(planContent);

  // Extract techniques and other plan elements
  const techniques = planContent?.techniques?.join(', ') || 'No specific techniques';
  const approach = planContent?.approach || 'No general approach defined';
  const focus = planContent?.focus || 'No specific focus area';

  // Get conversation history and insights using utility functions
  const recentHistory = history
    ? mapMessagesToString(history.slice(-100))
    : 'No conversation history available';
  const userInsights = history
    ? mapInsightsToString({ history } as ConversationContext)
    : 'No specific insights recorded yet';

  // TODO add this:
  // - **Current Active Goal Codename (if any):** ${activeGoalCodename || 'None'}
  return `**THERAPEUTIC MESSAGE ANALYSIS REQUEST**

**Conversation Context:**
${recentHistory} // Includes latest AI response and user message
[User Latest]: ${message.content}

**User Insights:**
${userInsights} // Key themes, patterns, hypothesized dynamics from previous synthesis

**Therapeutic Plan Context:**
- **Focus Area:** ${focus}
- **General Approach:** ${approach}
- **Techniques:** ${techniques}
- **Current Goals:**
${mapCurrentGoalsToString(currentGoals)} // List of goal objects with codenames, content, conditions

**Analysis Tasks:**
1.  **Assess User's Immediate Stance & Feeling:** Analyze the '[User Latest]' message. What is the primary feeling expressed? Critically, what is the user's apparent stance towards the *previous AI message* or the *current topic/goal* (e.g., engaged, receptive, ambivalent, resistant, avoidant, setting a boundary, confused, distressed)?
2.  **Evaluate Goal Progress & Relevance:**
    *   Did the user's message directly address or make progress on the 'Current Active Goal'?
    *   Based on their stance (Task 1), does pursuing the 'Current Active Goal' *in the next turn* seem appropriate and respectful, or likely to encounter resistance or invalidate the user?
3.  **Check for Significant Shifts:** Has the user introduced significant new information, shifted focus unexpectedly, or shown a notable change in emotional state compared to the recent baseline?
4.  **Detect Language:** Identify the language of the '[User Latest]' message.
5.  **Determine Need for Plan Revision:** Based ONLY on the "Plan Revision Criteria" below, decide if the *entire plan* requires a fundamental revision ('shouldBeRevised: true').
6.  **Determine Next Goal/Action within Current Plan (if not revising):** If 'shouldBeRevised: false', decide the next step:
    *   **Continue:** If the user is engaged with the 'Current Active Goal' OR if the goal remains the most relevant focus despite minor deviations. Set 'nextGoal' to 'Current Active Goal Codename'.
    *   **Switch:** If the user's message strongly aligns with a *different existing goal* in the 'Current Goals' list that better matches their immediate state/focus. Set 'nextGoal' to the codename of that other goal.
    *   **Pause/Listen:** If the user sets a firm boundary, expresses significant distress needing validation *before* goal work, or explicitly rejects the current direction *without* meeting revision criteria. Set 'nextGoal' to 'null'. This implies the next AI turn should be purely supportive listening/validation.

**Plan Revision Criteria:**
The therapeutic plan should be revised ('shouldBeRevised: true') if:
- A major goal is achieved.
- Significant new information is provided by the user *that fundamentally changes the case conceptualization*.
- The user's emotional state changes dramatically *and persistently*.
- **The user explicitly expresses significant dissatisfaction, frustration, calls the AI unhelpful, or feels misunderstood.**
- **Current goals consistently prove misaligned, leading to repeated resistance or avoidance across several turns.**
- The user requests a *deep exploration* (e.g., "Why do I always do this?") that requires developing new, structured goals not currently in the plan.

**Response Format:**
Return only valid JSON matching this exact structure:
{
  "nextGoal": "meaningful_identifier_or_null", // Codename of the goal for the *next* turn, or null if goals are paused/plan revises
  "language": "detected language code or name", // e.g., "en", "ru"
  "shouldBeRevised": true/false, // Decision based *only* on Plan Revision Criteria
  "reason": "Brief explanation for the decision on shouldBeRevised and nextGoal, crucially mentioning the user's detected stance and goal relevance/progress. (Must be in English)"
}

**Guidelines:**
- **User Stance is Key:** The user's stance (Task 1) heavily influences the decision about 'nextGoal' when 'shouldBeRevised' is 'false'. Prioritize respecting boundaries and readiness. Resistance often means setting 'nextGoal' to 'null' (Pause/Listen) before potentially trying again later or triggering a revision if persistent.
- **'shouldBeRevised' Logic:** Set to 'true' *only* if one of the specific criteria is met. Do not set to 'true' just because the user disagrees once.
- **'nextGoal' Logic:** Represents the *intended focus* for the next AI turn. If 'shouldBeRevised' is 'true', 'nextGoal' must be 'null'. If pausing goals, 'nextGoal' must be 'null'.
- **Reason Field:** Clearly justify the decision, linking it to user stance, goal progress/relevance, and/or specific revision criteria.
`;
};
