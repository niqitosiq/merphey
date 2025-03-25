import { Message } from 'src/domain/aggregates/conversation/entities/Message';
import {
  ConversationContext,
  UserMessage,
} from 'src/domain/aggregates/conversation/entities/types';
import { PlanContent } from 'src/domain/aggregates/therapy/entities/PlanVersion';
import { TherapeuticPlan } from 'src/domain/aggregates/therapy/entities/TherapeuticPlan';

interface PlanRevisionPromptData {
  contextUpdate: ConversationContext;
  message: Message;
  existingPlan: TherapeuticPlan;
  maxHistoryDepth: number;
}

export const mapMessagesToString = (messages: UserMessage[]): string => {
  return messages.map((m) => `[${m.role}]: '${m.content}'`).join('\n');
};

export const mapInsightsToString = (context: ConversationContext): string => {
  return (
    context.history
      ?.filter((msg) => msg.metadata?.breakthrough || msg.metadata?.challenge)
      .map((msg) => `- ${msg.metadata?.breakthrough || msg.metadata?.challenge}`)
      .join('\n') || 'No specific insights recorded yet'
  );
};

export const mapGoalsToString = (planContent: PlanContent | undefined): string => {
  if (!planContent?.goals) return 'No goals currently defined';

  return planContent.goals
    .map((g) => `[${g.state}]: ${g.content}\nApproach: ${g.approach}; Identifier: "${g.codename}"`)
    .join('\n\n');
};

const mapCurrentGoalsToString = (goals: PlanContent['goals']): string => {
  if (!goals?.length) return 'No goals currently defined';

  return goals
    .map((goal) => `- [${goal.state}] ${goal.content} (Approach: ${goal.approach})`)
    .join('\n');
};

export const buildPlanRevisionPrompt = ({
  contextUpdate,
  message,
  existingPlan,
  maxHistoryDepth,
}: PlanRevisionPromptData): string => {
  const recentMessages = contextUpdate.history.slice(-maxHistoryDepth);
  const userRiskProfile =
    contextUpdate.riskHistory.length > 0
      ? contextUpdate.riskHistory[contextUpdate.riskHistory.length - 1]
      : 'No risk assessment available';

  const currentGoals = existingPlan.getCurrentGoals() || [];
  const planContent = existingPlan?.currentVersion?.getContent();

  const userInsights = mapInsightsToString(contextUpdate);
  const techniques = planContent?.techniques?.join(', ') || 'No specific techniques';
  const approach = planContent?.approach || 'No general approach defined';
  const focus = planContent?.focus || 'No specific focus area';

  return `**THERAPEUTIC PLAN REVISION REQUEST**

**Key User Context:**  
- Current State: ${contextUpdate.currentState}  
- Recent Messages:  
${mapMessagesToString(recentMessages)}  
- Key Insights: ${userInsights}  
- Risk Profile: ${JSON.stringify(userRiskProfile)}

**Therapeutic Plan Context:**  
- Focus Area: ${focus}  
- General Approach: ${approach}  
- Techniques: ${techniques}

**Current Goals:**  
${mapCurrentGoalsToString(currentGoals)}

**Instructions for Response:**  
1. Analyze the user's current state and recent messages.  
2. Update the therapeutic plan to address immediate needs and long-term progress.  
3. Ensure the plan is tailored to the user's context and history.  
4. Provide clear, actionable goals with specific approaches.
5. Don't use double quotes inside the json strings.

**Goals Guidelines:**  
- Each goal should be clear and actionable.  
- Goals should be tailored to the user's current state and needs.  
- Goals should build on the user's progress and history.

**Return Format:**
{
  "goals": [
    {
      "codename": "unique_identifier",
      "state": "INFO_GATHERING/ACTIVE_GUIDANCE/etc.",
      "content": "Goal description",
      "approach": "Detailed instructions for responding to the user"
    }
  ],
  "techniques": ["list of techniques"],
  "approach": "Overall conversation approach",
  "focus": "Current therapeutic focus",
  "riskFactors": ["identified risk factors"],
  "metrics": {
    "completedGoals": ["achieved goals"],
    "progress": "assessment of progress"
  }
}`;
};
