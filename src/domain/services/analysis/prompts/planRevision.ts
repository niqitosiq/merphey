import { Message } from 'src/domain/aggregates/conversation/entities/Message';
import {
  ConversationContext,
  UserMessage,
} from 'src/domain/aggregates/conversation/entities/types';
import { PlanContent } from 'src/domain/aggregates/therapy/entities/PlanVersion';
import { TherapeuticPlan } from 'src/domain/aggregates/therapy/entities/TherapeuticPlan';
import { mapCurrentGoalsToString, mapInsightsToString, mapMessagesToString } from './utils';

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
### **Deep Synthesis & Conceptualization Instructions (Internal Processing Steps):**
*Before generating the goals list, perform the following analytical steps based *only* on the provided context:*

1.  **Synthesize Comprehensive User Portrait:** Integrate *all* provided user context (Current State, Messages, Insights, Risk, History implied in messages/insights) into a concise, coherent narrative understanding of the user's current presentation, recurring themes, emotional patterns, and communication style.
2.  **Generate Hypotheses about Underlying Dynamics:** Based on the synthesized portrait, formulate working hypotheses regarding:
    *   Potential core beliefs or schemas (about self, others, world).
    *   Possible unmet needs, hidden motivations, fears, or desires driving behavior.
    *   Characteristic coping mechanisms (both adaptive and maladaptive).
    *   Identifiable strengths, skills, or resources.
    *   Key vulnerabilities or challenge areas.
3.  **Develop Preliminary Case Conceptualization:** Briefly outline a working model explaining *how* various aspects of the user's experience (thoughts, feelings, behaviors, history, context) might interrelate to produce and maintain the current 'Focus Area'. This formulation should guide the therapeutic direction.
4.  **Justify Evidence-Based Alignment:** Briefly rationalize *why* the intended 'General Approach' and potential 'Techniques' are appropriate for this specific user, considering their synthesized portrait, hypothesized dynamics, and the preliminary conceptualization. Align with broadly accepted evidence-based principles relevant to the user's likely needs (e.g., principles from CBT, ACT, DBT, psychodynamic approaches, etc., as applicable to a conversational AI context).

---
### **Instructions for Response Generation (Goals & Plan):**
*Based on the preceding internal synthesis and conceptualization:*

1.  **Ground Goals in Synthesis**: Ensure *all* proposed 'goals' directly stem from the User Portrait, Hypotheses, and Conceptualization developed above. Prioritize deeply exploring the user’s character, background, and needs *as understood through the synthesis*. Use open-ended questions, active listening, and reflection *before* suggesting exercises. Leverage history and insights for personalization.
2.  **Analyze Current State Dynamically**: Continuously re-evaluate the user's immediate needs and long-term progress based on the *very latest* messages and responses, refining the conceptualization if necessary. Attend to emotional cues and shifts.
3.  **Update the Plan Holistically**: Tailor the *entire* therapeutic plan (goals, techniques, approach, focus) based on the comprehensive user understanding derived from the synthesis. Favor dialogue-based goals (e.g., exploring emotions, examining beliefs identified in hypotheses) over exercises. Include only a *few* highly targeted interventions if appropriate.
4.  **Define Single-Action Goals**: Each goal must focus on **one specific therapeutic action** (e.g., exploring a specific feeling, examining a specific thought pattern, practicing one reflection technique). Break down multi-step interventions into sequential goals. Prioritize dialogue and exploration.
5.  **Flexible Use of Conditions**: Use the 'conditions' field strategically to trigger goals, creating a responsive dialogue tree. Conditions should reflect the synthesized understanding and hypotheses (e.g., trigger exploration of a core belief if related themes emerge; trigger based on emotional state, keywords, goal completion, or readiness for depth).
6.  **Logical and Adaptive Structure**: Goals should form a coherent progression or adaptive tree, guided by the conceptualization but flexible enough to respond to the user's emergent needs and responses. The plan *must* adapt dynamically.
7.  **Detailed Micro-Approach**: For each goal, describe *how* to implement the action, emphasizing concrete ways to demonstrate empathy, validation, and understanding (e.g., "Reflect the user's feeling of X before asking...", "Validate the difficulty related to hypothesized vulnerability Y...").
8.  **Varied but Focused Techniques**: Combine dialogue methods (Socratic questioning, reflection, validation), exploration, and minimal, targeted exercises, focusing on depth related to the conceptualization. List these in the 'techniques' field.
9.  **Integrate Risk Considerations**: Explicitly adjust goal content, depth, and pacing based on the 'Risk Profile' and any emergent risk cues, ensuring safety and support. Note relevant risk factors in the 'riskFactors' field.
10. **Psychological Alignment**: Ensure the *specific application* of techniques aligns with evidence-based principles appropriate for a conversational format and the user's conceptualized needs.
11. **Avoid Overload**: Focus on quality dialogue and depth over quantity. Limit the number of active goals and avoid suggesting too many exercises at once.
12. **No Quotes in JSON**: Ensure no double quotes are used within JSON string values.

---

### **Goals Guidelines:**
- Each goal must have a clear purpose tied to the synthesis/conceptualization and focus on **one action**.
- Conditions must be precise, based on observable user behavior/statements *or* predicted states based on the conceptualization.
- The 'approach' description must provide specific micro-instructions, highlighting empathy and validation.
- Goals should allow the conversation to evolve naturally based on the user's lead, within the conceptual framework.

#### **Example of a Well-Structured Goal (Informed by Hypothetical Synthesis):**
*(Assuming synthesis suggested user feels inadequate and avoids challenges)*
{
  "conditions": "user expresses self-criticism OR avoids discussing a recent difficulty mentioned",
  "codename": "explore_self_criticism_link_to_avoidance",
  "state": "INFO_GATHERING",
  "content": "Gently explore the connection between self-critical thoughts and avoidance behavior",
  "approach": "Validate the user's expressed feeling first (e.g., 'It sounds like you're being really hard on yourself right now'). Then, reflect the potential pattern identified in synthesis: 'I notice sometimes when these critical thoughts come up, it seems challenging to face X. I wonder if there might be a connection there for you? No pressure to explore it if now isn't the right time.'"
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
      "approach": "Detailed instructions for a single therapeutic action grounded in synthesis"
    }
    // ... other goals
  ],
  "techniques": ["list of techniques planned based on synthesis"],
  "approach": "Overall conversation approach informed by conceptualization",
  "focus": "Current therapeutic focus, potentially refined by synthesis",
  "riskFactors": ["identified risk factors to monitor"],
  "metrics": {
    "completedGoals": ["list past achieved goals"],
    "progress": "brief assessment of progress based on recent interaction and synthesis"
  }
}`;
};
