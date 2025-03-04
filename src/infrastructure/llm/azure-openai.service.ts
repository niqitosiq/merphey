import { AzureOpenAI } from 'openai';
import { config } from '../config';
import { log } from 'console';

// Define conversation step type
export enum ConversationStepType {
  INITIAL_ANALYSIS = 'initial_analysis',
  QUESTION_GENERATION = 'question_generation',
  CONVERSATION_PLAN = 'conversation_plan',
  QUESTION_EXPLORATION = 'question_exploration',
  FINAL_ANALYSIS = 'final_analysis',
}

// Define interface for conversation context
export interface ConversationContext {
  initialProblem?: string;
  analyzedProblem?: string;
  questionsAndAnswers?: Array<{ question: string; answer: string }>;
  conversationPlan?: ConversationPlan;
  currentQuestion?: QuestionNode;
  previousAnswers?: Record<string, string>;
  conversationHistory?: Array<{ role: string; content: string }>;
  currentQuestionExchanges?: number; // Track number of exchanges for current question
  questionProgress?: Record<string, QuestionExplorationProgress>;
}

// Define interface for the conversation plan
export interface ConversationPlan {
  mainTopics: QuestionNode[];
  recommendedDepth: number;
}

// Define interface for question nodes in a tree structure
export interface QuestionNode {
  id: string;
  text: string;
  explanation?: string;
  subQuestions?: QuestionNode[];
  parentId?: string;
}

// Define interface for conversation step processor
interface ConversationStepProcessor {
  process(client: AzureOpenAI, deployment: string, context: ConversationContext): Promise<any>;
}

export interface QuestionExplorationResult {
  response: string;
  isComplete: boolean;
  completionReason?: string;
}

export interface QuestionExplorationProgress {
  question: QuestionNode;
  isComplete: boolean;
  completionReason?: string;
  currentExchanges: number;
}

export interface BatchExplorationResult {
  response: string;
  questionsProgress: Record<string, QuestionExplorationProgress>;
  suggestedNextQuestions: QuestionNode[];
  shouldContinue: boolean;
}

export class AzureOpenAIService {
  private client: AzureOpenAI;

  // Define models for each conversation step
  private readonly modelDeployments = {
    [ConversationStepType.INITIAL_ANALYSIS]: 'gpt-4o-mini',
    [ConversationStepType.CONVERSATION_PLAN]: 'gpt-4o-mini',
    [ConversationStepType.QUESTION_GENERATION]: 'gpt-4o-mini',
    [ConversationStepType.QUESTION_EXPLORATION]: 'gpt-4o-mini',
    [ConversationStepType.FINAL_ANALYSIS]: 'gpt-4o-mini',
  } as const;

  private readonly initialPrompt = `Ты практикующий психолог, тебя зовут Филип. Твоя задача помочь пользователям решить психологические проблемы, путем создания программы помощи, исследования гипотез о личности. Следуй рекомендациям ниже, планируй встречи с клиентом на будущее. 
Сначала предоставляй аналитику, а затем суммируй её, задавая конкретные вопросы и давая важные для понимания комментарии, как в обычном человеческом диалоге.
если задаешь вопросы, то нумеруй их, чтобы пользователю было удобно на них отвечать. 
Составь программу текущего занятия, так чтобы это заняло примерно час, а также краткую программу следующего занятия с пространством для вариативности.
помни, что план проведенный тобой в дальнейшем будет интерпретирован и отформатирован другим психологом для проведения конкретной сессии, чтобы задавать вопросы и давать рекомендации последовательно, это должна быть инструкция для него.
задавай вопросы глубкие, основывая их на анализе личности, будь подробен в них, приводи пример и делай отсылки.
например:
"
{приветствие} 
{Дополнительная информация}
вопросы для расширения контекста: 
1) вопрос
...
2) вопрос
действия в зависимости от ответа:
1) в случае если ответ на вопрос 1, то порекомендуй [ ]...
2) ...
{дисклеймер}"
Сочетайте стандартизированные тесты с глубинными вопросами.
Персонализируйте язык: имя, ссылки на прошлое, интересы.
При сомнениях в диагнозе — направляйте к специалисту.
1. Фаза диагностики и оценки
1.1. Стандартизированный скрининг (DSM-5/МКБ-11):
Тревога:
Используйте GAD-7: «Как часто за последние 2 недели вы испытывали беспокойство, мешающее сосредоточиться?»
Депрессия:
Используйте PHQ-9: «Чувствовали ли потерю интереса к ранее приятной деятельности?»
Стресс:
Примените PSS-10: «Насколько сложно вам расслабляться после напряженного дня?»
1.2. Психоаналитическая оценка:
Исследование истории жизни:
Задавайте открытые вопросы:
«Какое событие из детства могло повлиять на ваши текущие реакции?»
«Есть ли повторяющиеся конфликты в отношениях?»
Свободные ассоциации:
«Опишите первое, что приходит в голову при слове "одиночество"?»
Анализ сопротивления:
«Какие темы вы избегаете обсуждать? Почему?»
1.3. Персонализация:
Используйте имя пользователя (если известно).
Ссылайтесь на предыдущие ответы:
«В прошлый раз вы упомянули проблемы со сном. Удалось найти решение?»
Фиксируйте уникальные детали: интересы, профессию, хобби.
2. Фаза выбора методик
2.1. Основные методы (уровень доказательности A):
Когнитивно-поведенческая терапия (КПТ):
Показания: Негативные автоматические мысли, избегание.
Техники: Дневник мыслей, поведенческие эксперименты.
MBSR (снижение стресса):
Показания: Физические симптомы стресса.
Техники: Body-scan, дыхание 4-7-8.
Диалектическая поведенческая терапия (DBT):
Показания: Импульсивность, эмоциональные качели.
Техники: «Противоположное действие», TIPP (температура-интенсивное движение-пейсинг-прогрессивная релаксация).
2.2. Психодинамические методы (уровень B):
Краткосрочная психодинамическая терапия:
Показания: Непроработанные травмы, межличностные конфликты.
Техники: Анализ переноса, интерпретация защитных механизмов.
Нарративная терапия:
Показания: Кризис идентичности, низкая самоэффективность.
Техники: Переписывание истории, поиск «исключений».
2.3. Алгоритм выбора:
Если преобладают физические симптомы → MBSR + элементы психодинамики (анализ стрессовых триггеров из прошлого).
Если когнитивные искажения → КПТ + нарративные техники.
Если эмоциональная дисрегуляция → DBT + анализ детских паттернов.
3. Фаза программы: структура сессий
3.1. Базовый протокол (пример для тревоги):
Неделя 1-2:
КПТ-упражнение: Таблица ABC (Активирующее событие → Мысли → Последствия).
Психоанализ: «Опишите раннее воспоминание, связанное с текущей тревогой».
Неделя 3-4:
Экспозиция: Иерархия тревоги от 1 до 10 баллов.
Нарративная техника: «Напишите диалог между вашей тревогой и внутренним защитником».
Неделя 5-6:
MBSR: 10-минутная медитация с фокусом на дыхании.
Персонализация: Если пользователь любит искусство → «Нарисуйте свою тревогу и преобразуйте образ».
3.2. Интеграция персонализации:
Используйте интересы пользователя в заданиях:
Для музыкантов: «Подберите мелодию, отражающую ваши эмоции».
Для спортсменов: «Свяжите физические упражнения с эмоциональным состоянием».
Упоминайте уникальные детали:
«Вы ранее говорили, что работаете учителем. Как ваша профессия влияет на стресс?»
4. Мониторинг и коррекция
4.1. Оценка прогресса:
Каждые 2 недели повторяйте PHQ-9/GAD-7.
Психоаналитические вопросы:
«Как изменилось ваше восприятие детской травмы, которую мы обсуждали?»
4.2. Коррекция плана:
Если прогресс <30%:
Добавьте техники из смежных методов (например, КПТ + анализ сновидений).
Спросите: «Какие упражнения вызывают сопротивление? Почему?»
5. Этические правила и кризисные сценарии
5.1. Дисклеймер:
Всегда указывайте:
«Я — ИИ, мои рекомендации основаны на алгоритмах. Для интерпретации бессознательных процессов или травм обратитесь к лицензированному аналитику. Контакты специалистов: [список]».
5.2. Кризисное вмешательство:
При словах «суицид», «не вижу смысла» → автоматически выводите:
«Срочно свяжитесь с психологом: [телефон горячей линии]. Вы не одни».
6. Пример диалога для ИИ
Пользователь: «После расставания чувствую пустоту и страх новых отношений».
LLM:
Диагностика:
PHQ-9: «Как часто за последние две недели вы чувствовали безнадежность?»
Психоанализ: «Были ли в детстве ситуации, когда вы теряли кого-то важного?»
Методика:
КПТ + нарративная терапия.
Программа:
Неделя 1: Дневник мыслей + «Опишите расставание как главу книги. Как бы вы её переписали?»
Неделя 2: Поведенческая активация: «Запланируйте встречу с другом, даже если нет желания».\n`;

  private readonly questionGenerationPrompt =
    'Based on the analyzed problem, generate a list of relevant questions and points to help the user reflect on their situation. Format each question on a new line preceded by "Q: ". Format all insight point in the "P: ".';

  private readonly conversationPlanPrompt =
    'You are a psychological analysis system. Based on the user\'s problem description, generate a detailed conversation plan to explore their issues in depth. Create a structured tree of questions organized by main themes and subquestions. Each main question should focus on a key area of their problem, and subquestions should delve deeper into specific aspects. Include 3-5 main questions and 2-4 subquestions for each main question. Your output must be in valid JSON format with the following structure: {"mainTopics": [{"id": "q1", "text": "Main question text", "explanation": "Brief explanation of why this question is important", "subQuestions": [{"id": "q1.1", "text": "Subquestion text", "explanation": "Brief explanation of this subquestion", "parentId": "q1"}]}], "recommendedDepth": 2}. The recommendedDepth field should suggest how deep the conversation should go (1-2).';

  private readonly questionExplorationPrompt = `You are engaged in an ongoing psychological consultation. Based on the user's initial problem and conversation history, help explore their thoughts and feelings while maintaining a natural, flowing conversation.

Important: You must carefully detect and respond to conversation completion signals. Look for these indicators:

1. Problem Resolution Signals:
- User expresses feeling better or having clarity
- They mention implementing suggested solutions
- They share positive changes or insights
- They express gratitude and seem ready to conclude
- They indicate their question has been answered
If detected, acknowledge progress and mark with "[RESOLUTION_DETECTED] User has indicated problem resolution: (brief explanation)"

2. User Unwillingness to Continue:
- Direct phrases: "I don't want to talk", "let's stop", "this is enough", "I'm done"
- Indirect signals: "okay", "thanks", "got it", short replies
- Signs of frustration or disengagement
- Decreasing engagement (shorter responses)
- Delayed or reluctant responses
- Repetitive or circular responses
- The conversation starts to go out from the main topic
- User's energy level drops significantly
- User's responses become vague or evasive
- User's language becomes more formal or distant
- User's responses indicate they're not interested in further exploration
- User's responses suggest they're not ready to open up further
If detected, mark all remaining questions as complete with "[QUESTION_COMPLETE_ALL] User has indicated they want to end the conversation"

3. Natural Conversation Completion:
- All main topics have been adequately discussed
- User's responses indicate closure on key issues
- The initial problem has been addressed
- User shows signs of implementable understanding
If detected, mark with "[NATURAL_COMPLETION] Conversation has reached natural conclusion: (brief explanation)"

4. Potential Trolling/Dishonesty:
- Highly inconsistent or contradictory statements
- Obviously false or absurd claims
- Mocking or deliberately provocative responses
- Rapid changes in described situations or personalities
If detected, respond professionally but mark with "[TROLL_DETECTED] Reason: (brief explanation)"

Your key objectives for normal conversation:
1. Review previous answers carefully to avoid asking about topics already covered
2. Connect different topics naturally instead of treating them as separate questions
3. Use information already provided to make informed follow-up questions
4. Look for deeper patterns and connections between different aspects of the user's situation
5. When a topic seems sufficiently explored, mark it complete and smoothly transition to related themes
6. Regularly check if the initial problem has been adequately addressed

Guidelines for conversation flow:
- Before asking new questions, validate if previous responses indicate resolution
- Watch for shifts in user's language suggesting they're ready to conclude
- If user seems satisfied with current understanding, don't force additional questions
- Pay attention to user's energy level and engagement
- Respect signals that indicate user has gotten what they needed
- Be sensitive to conversation momentum - if it's naturally winding down, don't artificially extend it

For each question that you determine is complete, mark it with [QUESTION_COMPLETE:question_id] followed by a brief reason.

Keep the conversation engaging and natural while addressing multiple topics. Don't overwhelm the user - focus on meaningful connections between different aspects of their situation.

Use user's language.

Be friendly, refer to previous answers, and provide thoughtful insights and reflections. Use emojies when appropriate.`;

  private readonly finalAnalysisPrompt = `You are a compassionate psychology assistant. Based on the user's problem and their answers to the questions, provide thoughtful guidance and support.

Important context handling:
1. If the conversation ended early due to user unwillingness:
- Acknowledge their choice to end the conversation
- Summarize any insights gained from the partial discussion
- Offer encouragement for seeking help when they're ready
- Keep the response brief and respectful

2. If trolling behavior was detected:
- Maintain professional tone
- Do not engage with or reinforce inappropriate responses
- Keep the analysis very brief and factual
- Suggest returning when ready for a genuine conversation

For complete conversations:
- Be empathetic and supportive
- Offer practical advice when appropriate
- Connect insights across different answers
- Suggest next steps or resources if relevant`;

  // Step processors mapped by step type
  private readonly stepProcessors: Record<ConversationStepType, ConversationStepProcessor> = {
    [ConversationStepType.INITIAL_ANALYSIS]: {
      process: async (client, deployment, context) => {
        const prompt = this.initialPrompt;
        const userContent = context.initialProblem || '';

        const result = await client.chat.completions.create({
          model: deployment,
          messages: [
            { role: 'system', content: prompt },
            { role: 'user', content: userContent },
          ],
        });

        console.log(result.choices[0]?.message?.content);

        return result.choices[0]?.message?.content || 'Failed to process your message.';
      },
    },

    [ConversationStepType.QUESTION_GENERATION]: {
      process: async (client, deployment, context) => {
        const prompt = this.questionGenerationPrompt;
        const userContent = context.analyzedProblem || '';

        const result = await client.chat.completions.create({
          model: deployment,
          messages: [
            { role: 'system', content: prompt },
            { role: 'user', content: userContent },
          ],
        });

        const content = result.choices[0]?.message?.content || '';

        return {
          questions: content
            .split('\n')
            .filter((line) => line.trim().startsWith('Q:'))
            .map((item) => item.trim()),
          points: content
            .split('\n')
            .filter((line) => line.trim().startsWith('P:'))
            .map((line) => line.trim()),
        };
      },
    },

    [ConversationStepType.CONVERSATION_PLAN]: {
      process: async (client, deployment, context) => {
        const prompt = this.conversationPlanPrompt;
        const userContent = context.analyzedProblem || context.initialProblem || '';

        const result = await client.chat.completions.create({
          model: deployment,
          messages: [
            { role: 'system', content: prompt },
            { role: 'user', content: userContent },
          ],
          response_format: { type: 'json_object' },
        });

        const content = result.choices[0]?.message?.content || '{}';

        try {
          const conversationPlan: ConversationPlan = JSON.parse(content);
          return conversationPlan;
        } catch (error) {
          console.error('Failed to parse conversation plan JSON:', error);
          return {
            mainTopics: [],
            recommendedDepth: 2,
          };
        }
      },
    },

    [ConversationStepType.QUESTION_EXPLORATION]: {
      process: async (client, deployment, context) => {
        const prompt = this.questionExplorationPrompt;

        // Get all available questions from the conversation plan
        const allQuestions =
          context.conversationPlan?.mainTopics.reduce((acc, topic) => {
            acc.push(topic);
            if (topic.subQuestions) {
              acc.push(...topic.subQuestions);
            }
            return acc;
          }, [] as QuestionNode[]) || [];

        if (allQuestions.length === 0) {
          return {
            response: 'No questions available to explore.',
            questionsProgress: {},
            suggestedNextQuestions: [],
            shouldContinue: false,
          };
        }

        // Create message history for continuous conversation
        const messages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
          { role: 'system', content: prompt },
          { role: 'user', content: `Initial problem: ${context.initialProblem || ''}` },
        ];

        // Add conversation history
        if (context.conversationHistory) {
          messages.push(
            ...context.conversationHistory.map((msg) => ({
              role: msg.role as 'system' | 'user' | 'assistant',
              content: msg.content,
            })),
          );
        }

        // Analyze existing answers for potential auto-completion of questions
        const questionsProgress: Record<string, QuestionExplorationProgress> = {};
        const incompleteQuestions = allQuestions.filter((q) => {
          const progress = context.questionProgress?.[q.id];

          // If we already know it's complete, keep that status
          if (progress?.isComplete) {
            questionsProgress[q.id] = progress;
            return false;
          }

          // Check if this question might be already answered in previous responses
          let isImplicitlyAnswered = false;
          const relatedAnswers = Object.entries(context.previousAnswers || {}).filter(
            ([_, answer]) => {
              // Look for answers that might contain information relevant to this question
              const questionKeywords = q.text.toLowerCase().split(' ');
              return questionKeywords.some(
                (keyword) => answer.toLowerCase().includes(keyword) && keyword.length > 4,
              );
            },
          );

          if (relatedAnswers.length > 0) {
            questionsProgress[q.id] = {
              question: q,
              isComplete: true,
              completionReason: 'Topic was covered in previous responses',
              currentExchanges: progress?.currentExchanges || 0,
            };
            return false;
          }

          questionsProgress[q.id] = {
            question: q,
            isComplete: false,
            currentExchanges: progress?.currentExchanges || 0,
          };
          return true;
        });

        messages.push({
          role: 'system',
          content: `Current question progress:\n${Object.entries(questionsProgress)
            .map(
              ([id, progress]) =>
                `${id}: ${
                  progress.isComplete
                    ? 'Complete'
                    : `In progress (${progress.currentExchanges} exchanges)`
                }${progress.completionReason ? ` - ${progress.completionReason}` : ''}`,
            )
            .join('\n')}`,
        });

        // Add previous answers context
        if (context.previousAnswers && Object.keys(context.previousAnswers).length > 0) {
          const answersContext = Object.entries(context.previousAnswers)
            .map(([id, answer]) => `${id}: ${answer}`)
            .join('\n');

          messages.push({
            role: 'system',
            content: `Previous answers:\n${answersContext}`,
          });
        }

        // Request the model to process multiple questions
        const result = await client.chat.completions.create({
          model: deployment,
          messages,
          temperature: 0.7, // Add some variation to make responses more natural
          presence_penalty: 0.6, // Encourage new topics rather than repeating
        });

        const content = result.choices[0]?.message?.content || 'Failed to explore questions.';

        // Add troll/unwillingness detection processing
        // Check for resolution detection
        const resolutionMatch = content.match(/\[RESOLUTION_DETECTED\](.*?)(?=\[|$)/);
        if (resolutionMatch) {
          return {
            response: `I'm glad to hear that you've found some clarity! 😊 ${resolutionMatch[1].trim()}\n\nWould you like me to provide a final summary of our discussion, or is there anything specific you'd like to focus on before we wrap up?`,
            questionsProgress: Object.fromEntries(
              Object.entries(questionsProgress).map(([id, progress]) => [
                id,
                { ...progress, isComplete: true, completionReason: 'Problem resolution achieved' },
              ]),
            ),
            suggestedNextQuestions: [],
            shouldContinue: false,
          };
        }

        // Check for natural completion
        const completionMatch = content.match(/\[NATURAL_COMPLETION\](.*?)(?=\[|$)/);
        if (completionMatch) {
          return {
            response: `It seems we've covered all the important aspects of your situation naturally. ${completionMatch[1].trim()}\n\nWould you like me to summarize our discussion or is there anything else you'd like to explore?`,
            questionsProgress: Object.fromEntries(
              Object.entries(questionsProgress).map(([id, progress]) => [
                id,
                {
                  ...progress,
                  isComplete: true,
                  completionReason: 'Natural conversation completion',
                },
              ]),
            ),
            suggestedNextQuestions: [],
            shouldContinue: false,
          };
        }

        // Check for troll detection marker
        const trollMatch = content.match(/\[TROLL_DETECTED\](.*?)(?=\[|$)/);
        if (trollMatch) {
          return {
            response:
              "I notice some inconsistencies in our conversation. To provide meaningful help, I need honest and consistent responses. If you'd like to have a genuine conversation about your concerns, let's start fresh. You can use /reset to begin again.",
            questionsProgress: Object.fromEntries(
              Object.entries(questionsProgress).map(([id, progress]) => [
                id,
                {
                  ...progress,
                  isComplete: true,
                  completionReason: 'Conversation terminated due to inconsistent responses',
                },
              ]),
            ),
            suggestedNextQuestions: [],
            shouldContinue: false,
          };
        }

        // Check for user wanting to end conversation
        const completeAllMatch = content.match(/\[QUESTION_COMPLETE_ALL\](.*?)(?=\[|$)/);
        if (completeAllMatch) {
          return {
            response:
              "I understand you'd like to end our conversation. Thank you for sharing with me. If you'd like to talk again later, you can always start a new conversation with /start.",
            questionsProgress: Object.fromEntries(
              Object.entries(questionsProgress).map(([id, progress]) => [
                id,
                {
                  ...progress,
                  isComplete: true,
                  completionReason: 'User requested to end conversation',
                },
              ]),
            ),
            suggestedNextQuestions: [],
            shouldContinue: false,
          };
        }

        // Process regular completion markers
        const completionMarkers = content.match(/\[QUESTION_COMPLETE:(.*?)\](.*?)(?=\[|$)/g) || [];
        completionMarkers.forEach((marker) => {
          const [_, questionId, reason] = marker.match(/\[QUESTION_COMPLETE:(.*?)\](.*?)$/) || [];
          if (questionId && questionsProgress[questionId]) {
            questionsProgress[questionId].isComplete = true;
            questionsProgress[questionId].completionReason = reason.trim();
          }
        });

        // Remove all markers from response
        const cleanResponse = content
          .replace(/\[QUESTION_COMPLETE:.*?\].*?(?=\[|$)/g, '')
          .replace(/\[QUESTION_COMPLETE_ALL\].*?(?=\[|$)/g, '')
          .replace(/\[TROLL_DETECTED\].*?(?=\[|$)/g, '')
          .trim();

        // Determine which questions to suggest next, prioritizing related topics
        const suggestedNextQuestions = incompleteQuestions
          .filter((q) => !questionsProgress[q.id].isComplete)
          .sort((a, b) => {
            // Prioritize questions that are related to the most recent answers
            const lastAnswer =
              context.conversationHistory?.[context.conversationHistory.length - 1]?.content || '';
            const aRelevance = a.text
              .toLowerCase()
              .split(' ')
              .filter((word) => lastAnswer.toLowerCase().includes(word)).length;
            const bRelevance = b.text
              .toLowerCase()
              .split(' ')
              .filter((word) => lastAnswer.toLowerCase().includes(word)).length;
            return bRelevance - aRelevance;
          })
          .slice(0, 2); // Limit to 2 questions to keep conversation focused

        const shouldContinue = suggestedNextQuestions.length > 0;

        return {
          response: cleanResponse,
          questionsProgress,
          suggestedNextQuestions,
          shouldContinue,
        };
      },
    },

    [ConversationStepType.FINAL_ANALYSIS]: {
      process: async (client, deployment, context) => {
        const prompt = this.finalAnalysisPrompt;

        const formattedQA = (context.questionsAndAnswers || [])
          .map((qa) => `Question: ${qa.question}\nAnswer: ${qa.answer}`)
          .join('\n\n');

        const userContent = `
Initial Problem: ${context.initialProblem || ''}

Questions and Answers:
${formattedQA}
`;

        const result = await client.chat.completions.create({
          model: deployment,
          messages: [
            { role: 'system', content: prompt },
            { role: 'user', content: userContent },
          ],
        });

        return result.choices[0]?.message?.content || 'Failed to generate analysis.';
      },
    },
  };

  constructor() {
    this.client = new AzureOpenAI({
      apiKey: config.azureOpenAI.apiKey,
      endpoint: config.azureOpenAI.endpoint,
      apiVersion: config.azureOpenAI.apiVersion,
    });
  }

  /**
   * Unified function to process any conversation step with the specified model
   * @param stepType - The type of conversation step to process
   * @param context - The conversation context
   * @returns Result of the processing step
   */
  async processConversationStep(
    stepType: ConversationStepType,
    context: ConversationContext,
  ): Promise<any> {
    const deployment = this.modelDeployments[stepType] || 'gpt-4o-mini';
    log(`Processing ${stepType} with deployment: ${deployment}`);

    const processor = this.stepProcessors[stepType];
    if (!processor) {
      throw new Error(`Unknown conversation step type: ${stepType}`);
    }

    return processor.process.call(this, this.client, deployment, context);
  }

  /**
   * Process the initial user message to understand the problem
   * @param message - The user's message describing their problem
   * @returns Processed and analyzed problem statement
   */
  async processInitialMessage(message: string): Promise<string> {
    return this.processConversationStep(ConversationStepType.INITIAL_ANALYSIS, {
      initialProblem: message,
    });
  }

  /**
   * Generate questions based on the analyzed problem
   * @param analyzedProblem - The processed problem from the first step
   * @returns List of questions and points to ask the user
   */
  async generateQuestions(analyzedProblem: string) {
    return this.processConversationStep(ConversationStepType.QUESTION_GENERATION, {
      analyzedProblem,
    });
  }

  /**
   * Generate a conversation plan based on problem analysis
   * @param analyzedProblem - The processed problem statement
   * @returns Structured conversation plan with main topics and subquestions
   */
  async generateConversationPlan(analyzedProblem: string): Promise<ConversationPlan> {
    return this.processConversationStep(ConversationStepType.CONVERSATION_PLAN, {
      analyzedProblem,
    });
  }

  /**
   * Explore a specific question with context from previous answers
   * @param currentQuestion - The current question to explore
   * @param initialProblem - The original problem statement
   * @param previousAnswers - Record of previous question IDs and their answers
   * @param conversationHistory - Array of previous conversation messages
   * @param currentQuestionExchanges - Number of exchanges for the current question
   * @returns Expanded discussion about the current question
   */
  async exploreQuestion(
    currentQuestion: QuestionNode,
    initialProblem: string,
    previousAnswers: Record<string, string> = {},
    conversationHistory: Array<{ role: string; content: string }> = [],
    currentQuestionExchanges: number = 0,
  ): Promise<QuestionExplorationResult> {
    return this.processConversationStep(ConversationStepType.QUESTION_EXPLORATION, {
      currentQuestion,
      initialProblem,
      previousAnswers,
      conversationHistory,
      currentQuestionExchanges,
    });
  }

  /**
   * Explore multiple questions in a batch with context from previous answers
   */
  async exploreQuestions(
    initialProblem: string,
    conversationPlan: ConversationPlan,
    previousAnswers: Record<string, string> = {},
    conversationHistory: Array<{ role: string; content: string }> = [],
    questionProgress: Record<string, QuestionExplorationProgress> = {},
  ): Promise<BatchExplorationResult> {
    return this.processConversationStep(ConversationStepType.QUESTION_EXPLORATION, {
      initialProblem,
      conversationPlan,
      previousAnswers,
      conversationHistory,
      questionProgress,
    });
  }

  /**
   * Generate final analysis based on the user's problem and answers to questions
   * @param initialProblem - The original problem statement from the user
   * @param questionsAndAnswers - Array of question-answer pairs
   * @returns Final analysis and guidance for the user
   */
  async generateFinalAnalysis(
    initialProblem: string,
    questionsAndAnswers: Array<{ question: string; answer: string }>,
  ): Promise<string> {
    return this.processConversationStep(ConversationStepType.FINAL_ANALYSIS, {
      initialProblem,
      questionsAndAnswers,
    });
  }
}
