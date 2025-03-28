import { ConfigInterface } from "./config.interface";

export const config: ConfigInterface = {
	LLMAdapterConfig:{
		apiKey:process.env.OPENROUTER_API_KEY || "",
		defaultModel: process.env.DEFAULT_MODEL || 'google/gemini-2.0-flash-001'
	}
}