import { AzureOpenAI } from 'openai';
import { config } from '../config';
import { log } from 'console';

export class AzureOpenAIService {
  private client: AzureOpenAI;

  constructor() {
    this.client = new AzureOpenAI({
      apiKey: config.azureOpenAI.apiKey,
      endpoint: config.azureOpenAI.endpoint,
      apiVersion: config.azureOpenAI.apiVersion,
    });
  }

  /**
   * Process the initial user message to understand the problem
   * @param message - The user's message describing their problem
   * @returns Processed and analyzed problem statement
   */
  async processInitialMessage(message: string): Promise<string> {
    const deployment = config.azureOpenAI.deployments.initialPrompt;
    const prompt = config.prompts.initialPrompt;

    log('Processing initial message with deployment:', deployment);

    const result = await this.client.chat.completions.create({
      model: deployment,
      messages: [
        { role: 'system', content: prompt },
        { role: 'user', content: message },
      ],
    });

    return result.choices[0]?.message?.content || 'Failed to process your message.';
  }

  /**
   * Generate questions based on the analyzed problem
   * @param analyzedProblem - The processed problem from the first step
   * @returns List of questions and points to ask the user
   */
  async generateQuestions(analyzedProblem: string): Promise<string[]> {
    const deployment = config.azureOpenAI.deployments.questionGeneration;
    const prompt = config.prompts.questionGenerationPrompt;

    const result = await this.client.chat.completions.create({
      model: deployment,
      messages: [
        { role: 'system', content: prompt },
        { role: 'user', content: analyzedProblem },
      ],
    });

    const content = result.choices[0]?.message?.content || '';

    // Parse the content to extract questions (Q:) and points (P:)
    const items = content
      .split('\n')
      .filter((line) => line.trim().startsWith('Q:') || line.trim().startsWith('P:'));

    return items.map((item) => item.trim());
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
    const deployment = config.azureOpenAI.deployments.finalAnalysis;
    const prompt = config.prompts.finalAnalysisPrompt;

    // Format the questions and answers for the LLM
    const formattedQA = questionsAndAnswers
      .map((qa) => `Question: ${qa.question}\nAnswer: ${qa.answer}`)
      .join('\n\n');

    const userContent = `
Initial Problem: ${initialProblem}

Questions and Answers:
${formattedQA}
`;

    const result = await this.client.chat.completions.create({
      model: deployment,
      messages: [
        { role: 'system', content: prompt },
        { role: 'user', content: userContent },
      ],
    });

    return result.choices[0]?.message?.content || 'Failed to generate analysis.';
  }
}
