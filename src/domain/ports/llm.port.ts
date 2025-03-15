/**
 * Interface for language model services
 * Defines contract that all LLM implementations must follow
 */
export interface LlmPort {
  /**
   * Generates text completion from a prompt
   * @param prompt - The prompt to complete
   * @param options - Additional model options
   * @returns string - Generated text completion
   */
  generateCompletion(prompt: string, options?: any): Promise<string>;

  /**
   * Analyzes text for specific attributes
   * @param text - Text to analyze
   * @param analysisType - Type of analysis to perform
   * @returns object - Analysis results
   */
  analyzeText(text: string, analysisType: string): Promise<any>;

  /**
   * Embeds text into vector space
   * @param text - Text to embed
   * @returns number[] - Vector representation
   */
  embedText(text: string): Promise<number[]>;
}
