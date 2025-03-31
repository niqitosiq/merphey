import {
  ConversationContext,
  UserMessage,
} from 'src/domain/aggregates/conversation/entities/types';
import { PlanContent } from 'src/domain/aggregates/therapy/entities/PlanVersion';

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

export const mapCurrentGoalsToString = (goals: PlanContent['goals']): string => {
  if (!goals?.length) return 'No goals currently defined';

  return goals
    .map((goal) => `- [${goal.state}] ${goal.content} (Approach: ${goal.approach})`)
    .join('\n');
};
