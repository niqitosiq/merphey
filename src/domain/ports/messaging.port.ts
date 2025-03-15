import { RiskLevel } from '../shared/enums';

/**
 * Interface for messaging and notification services
 * Defines how alerts and notifications are sent to external systems
 */
export interface MessagingPort {
  /**
   * Sends notification to appropriate stakeholders based on risk level
   * @param userId - The ID of the user in crisis
   * @param messageContent - Content that triggered the notification
   * @param riskLevel - The assessed risk level
   * @param factors - Risk factors identified in the message
   */
  sendCrisisAlert(
    userId: string,
    messageContent: string,
    riskLevel: RiskLevel,
    factors: string[],
  ): Promise<void>;

  /**
   * Sends summary notification about user progress or concerns
   * @param userId - The ID of the user
   * @param summary - Summary of user interaction or concerns
   * @param requiresAttention - Whether human attention is needed
   */
  sendProgressNotification(
    userId: string,
    summary: string,
    requiresAttention: boolean,
  ): Promise<void>;

  /**
   * Sends system alert for technical issues
   * @param errorCode - Error code or identifier
   * @param errorMessage - Detailed error description
   * @param severity - Severity level of the error
   */
  sendSystemAlert(errorCode: string, errorMessage: string, severity: string): Promise<void>;
}
