import { RiskLevel } from "@prisma/client";

interface EmergencyPromptData {
  message: string;
  riskFactors: string[];
  riskLevel: RiskLevel;
  userLanguage: string;
}

export const buildEmergencyPrompt = ({
  message,
  riskFactors,
  riskLevel,
  userLanguage,
}: EmergencyPromptData): string => {
  const languageInstruction =
    userLanguage !== 'en'
      ? `IMPORTANT: Generate the "content" field in ${userLanguage} language as it will be shown directly to the user. All other fields must be in English for internal processing.`
      : '';

  return `You are a crisis support specialist providing immediate assistance to someone in crisis.

${languageInstruction}

CONTEXT:
Message: ${message}
Risk Factors: ${riskFactors.join(', ')}
Risk Level: ${riskLevel}

RESPONSE REQUIREMENTS:
1. Immediate acknowledgment of their situation
2. Clear expression of concern and support
3. Direct but gentle safety inquiries
4. Specific, actionable next steps
5. Crisis resource information integration

Generate a JSON response with the following structure:
{
  "content": "Your crisis response here in ${userLanguage === 'en' ? 'English' : userLanguage} - THIS IS THE ONLY FIELD THAT SHOULD BE IN THE USER'S LANGUAGE",
  "requiredActions": ["action1_in_english", "action2_in_english"],
  "safetyPlan": {
    "immediateSteps": ["step1_in_english", "step2_in_english"],
    "copingStrategies": ["strategy1_in_english", "strategy2_in_english"]
  }
}

Response must be empathetic, clear, and focused on immediate safety.`;
};
