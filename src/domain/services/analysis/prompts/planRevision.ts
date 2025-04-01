import { Message } from 'src/domain/aggregates/conversation/entities/Message';
import {
  ConversationContext,
  UserMessage,
} from 'src/domain/aggregates/conversation/entities/types';
import { PlanContent } from 'src/domain/aggregates/therapy/entities/PlanVersion';
import { TherapeuticPlan } from 'src/domain/aggregates/therapy/entities/TherapeuticPlan';
import { mapCurrentGoalsToString, mapInsightsToString, mapMessagesToString } from './utils';
import { ConversationState } from '@prisma/client';

interface PlanRevisionPromptData {
  contextUpdate: ConversationContext;
  message: Message;
  existingPlan: TherapeuticPlan;
  maxHistoryDepth: number;
}

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
  //  TODO
  // - **Previous Goals & Outcomes:** ${mapPreviousGoalsToString(previousGoals)}
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
- **Previous Focus Area:** ${focus}
- **Previous General Approach:** ${approach}
- **Previous Techniques Used:** ${techniques}
- **Existing Current Goals:**
  ${mapCurrentGoalsToString(currentGoals)}

---
### **Instructions for Response Generation:**

**Phase 1: Psychological Synthesis (Internal Analysis - DO NOT include in final JSON output field 'goals', but use to inform them)**

1.  **Synthesize a User Psychological Portrait:** Based *all* available context (history, insights, recent messages, risk profile, past goals), formulate a concise working hypothesis about the user. Include:
    *   **Core Conflict/Issue:** What seems to be the central struggle? (e.g., fear of intimacy vs desire for connection, perfectionism vs fear of failure).
    *   **Key Defense Mechanisms/Coping Styles:** How does the user manage difficult emotions or situations? (e.g., intellectualization, avoidance, projection, idealization).
    *   **Suspected Underlying Needs/Motivations:** What fundamental needs might be driving their behavior/feelings? (e.g., safety, validation, control, autonomy, belonging).
    *   **Identified Strengths/Resources:** What internal or external factors support the user? (e.g., insight, resilience, support system, past successes).
    *   **Potential Therapeutic Levers:** What areas seem most promising for exploration or intervention right now? (e.g., exploring the function of a defense, connecting emotion to behavior, examining relationship patterns).
    *   **Attachment Style Indicators (if applicable):** Any hints towards anxious, avoidant, secure, or disorganized patterns?

**Phase 2: Therapeutic Plan Formulation (Generate the JSON output)**

2.  **Refine Focus and Approach:** Based on the synthesis, define the *updated* therapeutic focus and general approach. Should it shift? Become more specific?
3.  **Prioritize Understanding & Validation:** Before defining intervention-based goals, prioritize goals focused on deepening the understanding of the user's experience. Use open-ended questions, active listening, reflection, and validation.
4.  **Analyze Current State & Immediate Needs:** Examine the *latest* message and recent interaction dynamics. What is the most pressing need expressed (explicitly or implicitly)? Is there resistance to address? Confusion to clarify? An emotion to validate?
5.  **Define Specific, Actionable Goals:**
    *   Each goal must focus on **one specific therapeutic action** (e.g., "Explore the function of procrastination today", "Validate the feeling of uncertainty", "Gently inquire about the origin of the 'idealized image'"). Break down complex interventions. **Ensure each goal naturally leads to a *single* focal point (e.g., one question, one reflection) in the AI's next response.**
    *   Prioritize dialogue-based goals (exploration, validation, clarification) over exercises. Include only 1-2 highly targeted exercises *if* the user seems ready and it directly addresses the current focus.
    *   **Crucially:** Link goals back to the synthesized psychological portrait. *Why* is this goal relevant given the understanding of the user? (This is for the AI's internal logic, reflected in the choice and phrasing of the goal/approach).
6.  **Use Conditions Flexibly:** Conditions should trigger goals based on:
    *   User's explicit statements or keywords.
    *   Expressed emotional states (sadness, frustration, uncertainty).
    *   *Implicit* cues (e.g., avoidance of a topic, short answers to deep questions, sudden topic shifts).
    *   Completion of prior exploratory goals.
    *   User readiness signals (e.g., detailed responses, asking "why").
7.  **Structure for Logical Flow:** Goals should form a potential path or tree, allowing user responses to guide the conversation naturally. The plan must be adaptable.
8.  **Detail the Approach:** For each goal, describe *how* to implement the action, emphasizing empathy, validation, and tentative language (e.g., "Gently wonder with the user...", "Reflect the feeling behind the words...", "Offer a possible connection without insisting...").
9.  **Integrate Techniques Appropriately:** Select evidence-based techniques (e.g., Motivational Interviewing, CFT elements, ACT defusion, psychodynamic exploration hints) that fit a conversational format and align with the synthesis. List them.
10. **Risk Consideration:** Adjust goal aggressiveness and approach based on the risk profile. Prioritize safety and stabilization if needed.
11. **Avoid Overload:** Focus on depth over breadth. A few well-chosen, deep goals are better than many superficial ones.
12. VERY IMPORTANT! **No Quotes in JSON Strings:** Ensure no unescaped double quotes within JSON string values.

---

### **Goals Guidelines:**
- **Purpose:** Focused, single action per goal, **intended to guide a single conversational step.**
- **Conditions:** Precise, based on explicit or *implicit* user cues.
- **Approach:** Specific instructions emphasizing validation, exploration, and tentative language. Rooted in the psychological synthesis. **Should guide the AI towards formulating *one* core question or reflection.**
- **Flexibility:** Allow the conversation to evolve step-by-step.

#### **Example of a Well-Structured Goal (informed by synthesis):**
*(Synthesis might indicate user intellectualizes to avoid vulnerability)*
{
  "conditions": "user explains behavior using purely logical terms OR avoids expressing associated feelings",
  "codename": "connect_logic_to_feeling",
  "state": "INFO_GATHERING",
  "content": "Gently explore the potential feelings underneath the logical explanation",
  "approach": "Validate the logic first ('That makes a lot of sense from that perspective'). Then, gently inquire about the emotional component: 'I wonder, aside from the logic, what feelings might have been present for you then?' or 'How did that feel in your body?' Use tentative language."
}

---

### **Return Format:**
{
  "goals": [
    {
      "conditions": "Specific conditions for activating this goal (consider implicit cues)",
      "codename": "unique_identifier",
      "state": "${Object.values(ConversationState)
        .map((s) => s.toUpperCase())
        .join(' | ')}",
      "content": "Goal description (single, specific action)",
      "approach": "Detailed instructions for the action, emphasizing empathy, validation, and linkage to synthesis"
    }
    // ... other goals
  ],
  "techniques": ["list", "of", "evidence-based", "techniques", "selected"],
  "approach": "Overall refined conversation approach based on synthesis",
  "focus": "Updated therapeutic focus based on synthesis",
  "riskFactors": ["identified or updated risk factors"],
  "metrics": {
    "completedGoals": ["list of achieved goal codenames"],
    "progress": "Qualitative assessment of progress based on synthesis and recent interaction"
  }
}`;
};
