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
1. **Focus on Understanding the User**: Prioritize deeply exploring the user’s character, background, and needs through open-ended questions, active listening, and reflection before suggesting exercises. Leverage the user’s history and insights from past interactions for a personalized experience.  
2. **Analyze Current State**: Examine recent messages and responses to identify immediate needs and long-term progress. Pay attention to emotional cues and recurring themes.  
3. **Update the Plan**: Tailor the therapeutic plan to the user’s unique context. Favor dialogue-based goals (e.g., exploring emotions) over exercises, including only a few targeted interventions.  
4. **Define Goals**: Each goal must focus on **one specific therapeutic action**. Break multi-step interventions into separate goals. Prioritize dialogue over exercises.  
5. **Flexible Use of Conditions**: Use the "conditions" field to trigger goals and build a dialogue tree. Conditions can depend on:  
   - Emotional state (e.g., user expresses sadness)  
   - Specific phrases or keywords (e.g., user says ‘I’m struggling’)  
   - Completion of prior goals (e.g., after explore_emotions)  
   - User readiness for deeper dialogue (e.g., user responds in detail to open questions)  
6. **Logical and Flexible Structure**: Goals should form a progression or tree, where user responses guide the conversation. The plan must adapt to new input dynamically.  
7. **Detailed Approach**: For each goal, describe how to implement the action, emphasizing ways to show understanding and support (e.g., reflecting the user’s feelings).  
8. **Variety of Techniques**: Combine dialogue methods, reflection, and minimal exercises, focusing on exploration.  
9. **Risk Consideration**: Adjust goals based on the risk profile to ensure a safe and supportive approach.  
10. **Psychological Alignment**: Apply evidence-based techniques suited to a conversational format.  
11. **Avoid Overload**: Limit exercises—focus on quality dialogue and depth over quantity.  
12. **No Quotes in JSON**: Avoid double quotes within JSON strings.  

---

### **Goals Guidelines:**
- Each goal must have a clear purpose and focus on **one action** (e.g., exploring a topic or a single exercise).  
- Conditions must be precise, based on observable user behavior or statements.  
- The approach must provide specific instructions, highlighting support and understanding.  
- Goals should be flexible, allowing the conversation to evolve naturally.  

#### **Example of a Well-Structured Goal:**
{
  "conditions": "user expresses uncertainty about feelings OR says ‘I don’t know’ more than once",
  "codename": "explore_emotions",
  "state": "INFO_GATHERING",
  "content": "Explore the user’s emotions through open questions",
  "approach": "Ask the user how they feel right now and encourage them to elaborate. Use reflection, e.g., ‘It seems like you’re finding it hard to pin down your emotions. What comes to mind?’"
}

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
