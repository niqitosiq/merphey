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
- Latest Message from user:  
${message.content};  
- Key Insights: ${userInsights}  
- Risk Profile: ${JSON.stringify(userRiskProfile)}  

**Therapeutic Plan Context:**  
- Focus Area: ${focus}  
- General Approach: ${approach}  
- Techniques: ${techniques}  

**Current Goals:**  
${mapCurrentGoalsToString(currentGoals)}  

**Instructions for Response:**  
1. Analyze the user's current state, recent messages, and insights to understand their immediate needs and long-term progress.  
2. Update the therapeutic plan to be flexible and adaptive, accounting for potential deviations in the user's responses and state.  
3. Define clear conditions for each goal to determine when it should be activated based on the user's input and behavior.  
4. Ensure the plan includes alternative goals or branching paths to cover different possible scenarios.  
5. Base the therapeutic approach, techniques, and goals on evidence-based practices and established psychological theories.  
6. Provide specific, actionable goals with detailed approaches for responding to the user.  
7. Include metrics for assessing progress using standardized tools or observable outcomes.  
8. Do not use double quotes inside the JSON strings.  

**Goals Guidelines:**  
- Each goal should have well-defined conditions that trigger its activation.  
- Conditions should be based on user statements, behaviors, or emotional states, and can use logical operators (AND, OR, NOT).  
- Goals should be clear, actionable, and tailored to the user's current state and history.  
- Include alternative goals to account for different user responses or needs.  
- Ensure there is a default or fallback goal if specific conditions are not met.  

**Evidence-Based Requirements:**  
- Align the therapeutic approach and techniques with proven psychological practices (e.g., Cognitive Behavioral Therapy (CBT), Dialectical Behavior Therapy (DBT), etc.).  
- Reference specific interventions or models that are effective for the user's condition.  
- Use standardized assessment tools or scales to measure progress where applicable (e.g., PHQ-9 for depression, GAD-7 for anxiety).  

**Return Format:**  
{
  "goals": [
    {
      "conditions": "Specific conditions for activating this goal (e.g., user expresses anxiety OR user mentions sleeplessness)",
      "codename": "unique_identifier",
      "state": "INFO_GATHERING/ACTIVE_GUIDANCE/etc.",
      "content": "Goal description",
      "approach": "Detailed instructions for responding to the user, based on evidence-based practices"
    }
  ],
  "techniques": ["list of evidence-based techniques"],
  "approach": "Overall conversation approach, grounded in psychological theory",
  "focus": "Current therapeutic focus, aligned with user's needs",
  "riskFactors": ["identified risk factors"],
  "metrics": {
    "completedGoals": ["achieved goals"],
    "progress": "Assessment of progress using standardized measures or observable outcomes"
  }
}`;
};
