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

**Message to Analyze:** "${message.content}"

**Conversation Context:**  
${recentHistory}

**User Insights:**  
${userInsights}

**Therapeutic Plan Context:**  
- Focus Area: ${focus}  
- General Approach: ${approach}  
- Techniques: ${techniques}

**Current Goals:**  
${goals}

**Analysis Tasks:**  
1. Has the user achieved any of the current goals based on their message?  
2. Has the user's context changed significantly, requiring a plan revision?  
3. What should be the next goal to focus on?  
4. What language is the user speaking?  
5. Should the therapeutic plan be revised?

**The plan should be revised if:**  
- The user provides significant new information.  
- The user expresses dissatisfaction with the current approach (e.g., frustration or calling the AI unhelpful).  
- The user's emotional state has changed dramatically.  
- The current goals are no longer appropriate.  
- **The user explicitly requests a deeper analysis of their behavior, emotions, or motivations (e.g., "why did I do this?").**

**Instructions for Response:**  
Return ONLY valid JSON in the following format without any additional text:
{
  "nextGoal": "meaningful_identifier",
  "language": "detected language code or name",
  "shouldBeRevised": true/false,
  "reason": "Brief explanation"
}`;
};
