import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env file
dotenv.config();

// Configuration structure for the application
export interface Config {
  telegramBot: {
    token: string;
  };
  azureOpenAI: {
    apiKey: string;
    endpoint: string;
    apiVersion: string;
    deployments: {
      initialPrompt: string;
      questionGeneration: string;
      finalAnalysis: string;
    };
  };
}

// Function to validate required environment variables
const validateRequiredEnvVars = (requiredEnvVars: string[]): void => {
  const missingEnvVars = requiredEnvVars.filter((envVar) => !process.env[envVar]);

  if (missingEnvVars.length > 0) {
    throw new Error(`Missing required environment variables: ${missingEnvVars.join(', ')}`);
  }
};

// Required environment variables for the application
const requiredEnvVars = [
  'TELEGRAM_BOT_TOKEN',
  'AZURE_OPENAI_API_KEY',
  'AZURE_OPENAI_ENDPOINT',
  'AZURE_OPENAI_API_VERSION',
  'INITIAL_PROMPT_DEPLOYMENT',
  'QUESTION_GENERATION_DEPLOYMENT',
  'FINAL_ANALYSIS_DEPLOYMENT',
];

// Validate required environment variables
validateRequiredEnvVars(requiredEnvVars);

// Export the configuration
export const config: Config = {
  telegramBot: {
    token: process.env.TELEGRAM_BOT_TOKEN!,
  },
  azureOpenAI: {
    apiKey: process.env.AZURE_OPENAI_API_KEY!,
    endpoint: process.env.AZURE_OPENAI_ENDPOINT!,
    apiVersion: process.env.AZURE_OPENAI_API_VERSION!,
    deployments: {
      initialPrompt: process.env.INITIAL_PROMPT_DEPLOYMENT!,
      questionGeneration: process.env.QUESTION_GENERATION_DEPLOYMENT!,
      finalAnalysis: process.env.FINAL_ANALYSIS_DEPLOYMENT!,
    },
  },
};
