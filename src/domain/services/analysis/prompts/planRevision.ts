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
    .map(
      (g) =>
        `[${g.state}]: Conditions: ${g.conditions}; \n ${g.content} \nApproach: ${g.approach}; Identifier: "${g.codename}"`,
    )
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
  #### **Key User Context:**
- **Current State:** ${contextUpdate.currentState}  
- **Recent Messages:**  
  ${mapMessagesToString(recentMessages)}  
- **Latest Message from User:**  
  ${message.content}  
- **Key Insights:** ${userInsights}  
- **Risk Profile:** ${JSON.stringify(userRiskProfile)}  

#### **Therapeutic Plan Context:**
- **Focus Area:** ${focus}  
- **General Approach:** ${approach}  
- **Techniques:** ${techniques}  

#### **Current Goals:**
${mapCurrentGoalsToString(currentGoals)}  

---

### **Instructions for Response:**
1. Analyze the user's current state and recent messages to identify their immediate needs and long-term progress.  
2. Update the therapeutic plan to address these needs, ensuring it is tailored to the user's context and history.  
3. Define clear, actionable goals, each focusing on **a single, specific therapeutic action or intervention**.  
   - **Important:** Each goal should represent **one discrete step or technique**. Do not include multiple actions or a sequence of steps within a single goal. If a therapeutic intervention involves multiple steps, break it down into separate goals, each with their own conditions and approaches.  
4. Use the "conditions" field to specify when each goal should be activated. Conditions can be based on:  
   - User's emotional state (e.g., "user expresses anxiety")  
   - Specific user statements or keywords (e.g., "user says 'не знаю' more than twice")  
   - Completion of previous goals (e.g., "after completing timeline_analysis_v2")  
5. Ensure that the goals form a logical progression or tree, where the outcome of one goal can influence the activation of subsequent goals.  
6. Provide a detailed approach for each goal, describing how to implement the specific therapeutic action or intervention.  
7. Include a variety of techniques and approaches to address different aspects of the user's needs.  
8. Consider the user's risk profile and any identified risk factors when formulating goals and approaches.  
9. Use evidence-based therapeutic techniques and ensure that the plan aligns with established psychological principles.  
10. Do not use double quotes inside the JSON strings.  

---

### **Goals Guidelines:**
- Each goal should have a clear, specific purpose and focus on **one therapeutic action**.  
- Conditions should be precise and based on observable user behaviors or statements.  
- The approach should provide concrete instructions for implementing the therapeutic action.  
- Goals should be adaptable to the user's responses and progress.  

#### **Example of a Well-Structured Goal:**
{
  "conditions": "user mentions feeling overwhelmed OR user describes a recent panic attack",
  "codename": "grounding_technique",
  "state": "ACTIVE_GUIDANCE",
  "content": "Introduce a grounding exercise to manage acute anxiety",
  "approach": "Guide the user through a 5-4-3-2-1 grounding technique: Ask them to name 5 things they can see, 4 things they can touch, 3 things they can hear, 2 things they can smell, and 1 thing they can taste. Encourage them to focus on their senses to anchor themselves in the present moment."
}
This example demonstrates a single, focused goal with a clear condition and a specific therapeutic action.

---

### **Return Format:**
{
  "goals": [
    {
      "conditions": "Specific conditions for activating this goal",
      "codename": "unique_identifier",
      "state": "INFO_GATHERING/ACTIVE_GUIDANCE/etc.",
      "content": "Goal description",
      "approach": "Detailed instructions for a single therapeutic action"
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
