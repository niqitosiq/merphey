# Psychobot Message Flow

## Overview

This document describes the flow of user messages through the Psychobot system, detailing how each message is processed, analyzed, and responded to by different components.

## System Components

1. **Telegram Bot Service** - The entry point for user interactions
2. **Session Management** - Handles user session persistence and state
3. **Message Processing Pipeline** - Processes and routes messages through appropriate handlers
4. **LLM-Powered Services:**
   - **Switcher** - Decides the next action in the conversation flow
   - **Communicator** - Generates appropriate conversational responses
   - **Psychologist** - Provides deeper psychological analysis when needed
   - **Finisher** - Handles session completion gracefully

## Message Flow Diagram

```
[User] → [Telegram Bot] → [Session Repository] → [Message Processing Pipeline] → [Response Generation] → [User]
                                                         ↓
                                      [Action Detection (Switcher)]
                                           /       |       \
                            [Psychologist]  [Communicator]  [Session Finisher]
```

## Detailed Flow Description

### 1. User Interaction & Entry Point

1. User sends a message to the Telegram bot
2. The `TelegramBotService` receives the message through the `message('text')` handler
3. The bot retrieves the user's session or creates a new one if none exists
4. The message is added to the session history with `from: 'user'` and `role: 'user'`

### 2. Message Processing

1. The service sets up essential handlers:
   - `typingHandler` - Shows typing indicator to the user
   - `pushHistory` - Updates the session with new messages
   - `reply` - Sends responses back to the user
   - `updateIsThinking` - Tracks LLM processing state

2. The message is passed to `proceedWithTextSimple()` which:
   - Calls `proceedWithText()` which processes the message using functional programming patterns
   - Handles errors and provides fallback responses

### 3. Action Detection (Switcher)

1. `detectAction()` analyzes the conversation history to determine the next action
2. Using a fine-tuned LLM model, it decides between:
   - `ASK_PSYCHO_IMMEDIATLY` - Immediate psychological analysis
   - `ASK_PSYCHO_BACKGROUND` - Background psychological analysis
   - `COMMUNICATE` - Continue normal conversation
   - `APPOINT_NEXT_SESSION` - Prepare for session transition
   - `FINISH_SESSION` - End the conversation

3. The decision is based on:
   - Conversation progress
   - Previous psychological guidance
   - User's emotional state
   - Current session context
   - Safety risks detected

### 4. Processing Paths

Based on the detected action, the system follows one of these paths:

#### Path A: Standard Communication
1. If `COMMUNICATE` action is selected:
   - `communicateWithUser()` generates a response using a lower-tier LLM
   - The response is formatted and sent to the user
   - The session history is updated

#### Path B: Psychological Analysis
1. If `ASK_PSYCHO_IMMEDIATLY` is selected:
   - `updateIsThinking` flag is set to true
   - `triggerDeepThink()` calls `askPsychologist()` with immediate flag
   - Response from psychologist determines next steps
   - Analysis is integrated into conversation context

2. If `ASK_PSYCHO_BACKGROUND` is selected:
   - Analysis runs in background without blocking the conversation
   - `shouldProceedWithCommunicate` set to true
   - System continues communication while analyzing

#### Path C: Session Completion
1. If `FINISH_SESSION` or `APPOINT_NEXT_SESSION` is selected:
   - `handleFinishingSession()` is called
   - A comprehensive closure response is generated with:
     - Final analysis
     - Recommendations
     - Next steps
     - Reason for ending
   - Session state is cleared or updated accordingly

### 5. Response Delivery

1. The final message array is returned to the Telegram bot service
2. Each message in the array is added to the session history as:
   ```
   {
     from: 'communicator',
     role: 'assistant',
     text: message
   }
   ```
3. The session is updated in the repository
4. Messages are sent to the user sequentially

## Special Message States

### Thinking State
- When deep analysis is happening, the bot tracks this with `isThinking` flag
- If additional messages arrive during thinking, they are processed with limited context
- System prevents redundant analyses while still being responsive

### Session Timeout
- If thinking state persists too long, a timeout mechanism resets it after 2 minutes
- This prevents the system from getting stuck in analysis

## LLM Usage Patterns

The system uses two tiers of LLM models:

1. **Low-tier LLM** (`getLowTierClient()`):
   - Used for: Action detection, standard communication
   - Characteristics: Lower token count, faster responses, higher temperature for creative responses

2. **High-tier LLM** (`getHighTierClient()`):
   - Used for: Deep psychological analysis, session finishing
   - Characteristics: Higher token limits, more precise reasoning, wider context window

## Command Handling

The bot implements several commands:
- `/start` - Creates a new session and greets the user
- `/reset` - Clears conversation history and starts fresh
- `/help` - Shows available commands
- `/personal` - Generates a psychological state report (referenced in help but implementation not shown)

## Error Handling

The system implements error boundaries at multiple levels:
1. Immediate fallback responses for LLM failures
2. Session validation to prevent processing without proper context
3. User-friendly error messages when issues occur