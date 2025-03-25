import { Message } from 'src/domain/aggregates/conversation/entities/Message';
import {
  ConversationContext,
  UserMessage,
} from 'src/domain/aggregates/conversation/entities/types';
import { TherapeuticPlan } from 'src/domain/aggregates/therapy/entities/TherapeuticPlan';
import { mapMessagesToString, mapInsightsToString, mapGoalsToString } from './planRevision';

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
  console.log('Analyzing message:', message.content);

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
    ? mapMessagesToString(history.slice(-15))
    : 'No conversation history available';
  const userInsights = history
    ? mapInsightsToString({ history } as ConversationContext)
    : 'No specific insights recorded yet';

  return `**THERAPEUTIC MESSAGE ANALYSIS REQUEST**

  **Message to Analyze:**  
"${message.content}"

**Conversation Context:**  
${recentHistory}

**User Insights:**  
${userInsights}

**Therapeutic Plan Context:**  
- **Focus Area:** ${focus}  
- **General Approach:** ${approach}  
- **Techniques:** ${techniques}

**Current Goals:**  
${goals}

**Analysis Tasks:**  
1. Assess if the user has achieved any current goals based on their message.  
2. Evaluate if the user's context or emotional state has shifted significantly.  
3. Identify the next logical goal based on progress or emerging needs.  
4. Detect the language of the user's message.  
5. Determine if the therapeutic plan requires revision.

**Plan Revision Criteria:**  
The therapeutic plan should be revised if:  
- A major goal is achieved.  
- Significant new information is provided by the user.  
- The user's emotional state changes dramatically.  
- The user expresses dissatisfaction with the approach (e.g., frustration or calling the AI unhelpful).  
- Current goals become irrelevant or misaligned.  
- The user requests deeper exploration of behavior, emotions, or motivations (e.g., "Why did I do this?").


**Response Format:**  
Return only valid JSON:  
{
  "nextGoal": "meaningful_identifier",
  "language": "detected language code or name",
  "shouldBeRevised": true/false,
  "reason": "Brief explanation"
}

**Guidelines:**  
- **Goal Achievement:** If a goal is met, set "nextGoal" to the next logical step in the therapeutic plan.  
- **Context Shift:** If the context changes but no goal is achieved, set "shouldBeRevised" to "true" with a clear reason.  
- **Progress Tracking:** If the user is on track, set "shouldBeRevised" to "false" and retain the current goal.  
- **Language Detection:** Use standard language codes (e.g., "en" for English, "es" for Spanish).  
- **Reason Field:** Keep explanations concise yet sufficient for therapist understanding.
`;
};
