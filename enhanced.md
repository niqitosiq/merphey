# Enhanced Psychobot Architecture

## Current Challenges

Based on the analysis of the current architecture, several areas for improvement have been identified:

1. Two parallel implementations (`src` and `src2`) causing code duplication
2. Complex message flow with multiple conditional paths
3. Limited error recovery mechanisms
4. Synchronous processing potentially causing latency
5. State management relying on shared mutable objects
6. Manual typing indicators that may not reflect actual processing time

## Proposed Enhanced Architecture

### 1. Unified Service Architecture

```
[User] → [Telegram Gateway] → [Message Queue] → [Processing Pipeline] → [Response Orchestrator] → [User]
                                                         ↓
                                             [Context-Aware Router]
                                                /     |      \
                                              /       |       \
                                        [Analysis] [Dialog] [Session]
                                         Services  Service   Service
```

### 2. Key Architectural Improvements

#### A. Event-Driven Message Processing

Replace the current function-call chain with an event-driven architecture:

```typescript
// Instead of:
const result = await proceedWithText(props);

// Use an event-based approach:
messageBus.publish('message:received', {
  userId,
  content: message,
  sessionId: session.id
});

// And subscribe to outcomes:
messageBus.subscribe('response:ready', async (response) => {
  await sendMessageToUser(response);
});
```

#### B. Context-Aware State Machine

Replace the string-based action system with a proper state machine:

```typescript
enum ConversationState {
  GATHERING_INFO,
  ANALYSIS_NEEDED,
  DEEP_ANALYSIS,
  GUIDANCE_DELIVERY,
  SESSION_CLOSING,
  ERROR_RECOVERY
}

class ConversationStateMachine {
  transition(event: ConversationEvent, context: ConversationContext): ConversationState {
    // Handle state transitions with proper context
  }
}
```

#### C. Enhanced Parallel Processing

Process analysis tasks in parallel without blocking the conversation flow:

```typescript
// Trigger background analysis with guaranteed completion
async function analyzeInBackground(conversationId: string, history: HistoryMessage[]) {
  const task = backgroundTasks.schedule('analysis', { conversationId, history });
  
  // Register callbacks for completion
  task.onCompleted((result) => {
    conversationContextStore.update(conversationId, { analysis: result });
    messageBus.publish('analysis:completed', { conversationId, result });
  });

  // Return immediately, allowing conversation to continue
  return { taskId: task.id };
}
```

## Detailed Improvements

### 1. Message Processing Pipeline

#### Current Flow:
```
User → TelegramBot → detectAction → handleActionResponse → communicateWithUser/askPsychologist → User
```

#### Enhanced Flow:
```
User → TelegramBot → MessagePreprocessor → ContextAnalyzer → IntentClassifier → 
       ResponseSelector → ResponseGenerator → ResponseEnhancer → User
```

Each component has clear responsibilities:
- **MessagePreprocessor**: Normalizes input, handles commands, sanitizes content
- **ContextAnalyzer**: Extracts sentiment, entities, and conversation context
- **IntentClassifier**: Determines user intent (more granular than current actions)
- **ResponseSelector**: Chooses appropriate response strategy
- **ResponseGenerator**: Creates response using appropriate LLM
- **ResponseEnhancer**: Adds empathy, continuity checks, and personalization

### 2. Improved LLM Utilization

#### Current:
Two tiers of LLMs with fixed assignments based on task importance

#### Enhanced:
Dynamic LLM selection based on:
1. **Task complexity**: Use embeddings to measure conceptual complexity
2. **User emotion**: Escalate to more sophisticated models for emotional content
3. **Conversation stage**: Use lighter models for routine exchanges
4. **Cost optimization**: Implement a budget-aware selection system

```typescript
interface LlmRequestContext {
  complexity: number;       // 0-1 score of message complexity
  emotionalContent: number; // 0-1 score of emotional content
  stage: ConversationStage; // Enum of conversation stages
  userPriority: number;     // Priority level for this user
  responseUrgency: number;  // How quickly response is needed
}

function selectOptimalLlm(context: LlmRequestContext): LlmClient {
  // Use decision matrix to select optimal model
  // This allows for much better resource allocation
}
```

### 3. Context Management

#### Current:
Session history as an array of messages with manual filtering

#### Enhanced:
Structured context with selective memory management:

```typescript
interface EnhancedContext {
  shortTermMemory: HistoryMessage[];    // Recent messages (last 10)
  longTermMemory: ContextSummary[];     // Summarized older conversations
  entityMemory: {                       // Important named entities mentioned
    [entityName: string]: EntityReference[];
  };
  psychologicalProfile: {               // Updated psychological attributes
    traits: { [trait: string]: number },
    concerns: string[],
    progress: { [area: string]: number }
  };
  sessionMetadata: {
    state: ConversationState,
    lastAnalysisTimestamp: number,
    sessionStartTime: number,
    interactionCount: number
  };
}
```

This structure allows for more nuanced context representation and better decision-making.

### 4. Asynchronous Processing

#### Current:
Synchronous processing with blocking waits and manual background handling

#### Enhanced:
Task-based asynchronous processing with proper orchestration:

```typescript
class TaskOrchestrator {
  async scheduleTask<T>(
    taskType: 'analysis' | 'response' | 'summarization',
    priority: number,
    payload: any
  ): Promise<Task<T>> {
    // Create and return a task that can be awaited or tracked
  }
  
  getActiveTasksForUser(userId: string): Task[] {
    // Return all active tasks for this user
  }
}
```

This allows for:
- Multiple concurrent analyses without blocking
- Better recovery from failures
- Prioritization of important tasks
- Progress monitoring for long-running operations

### 5. Error Handling and Recovery

#### Current:
Basic error boundaries with fallback responses

#### Enhanced:
Multi-layered error handling with graceful degradation:

```typescript
class ResilientProcessor {
  async process(input: UserMessage): Promise<BotResponse> {
    try {
      // Try best-case processing path
      return await this.fullProcessingPipeline(input);
    } catch (error) {
      if (this.canRecoverWithReducedContext(error)) {
        // Try with reduced context if that's the issue
        return await this.reducedContextPipeline(input);
      } else if (this.isModelUnavailable(error)) {
        // Fall back to simpler model
        return await this.fallbackModelPipeline(input);
      } else if (this.isTemporaryFailure(error)) {
        // Add to retry queue and return interim response
        this.scheduleRetry(input);
        return this.createInterimResponse(input);
      } else {
        // Last resort fallback
        return this.createSafetyFallbackResponse(input, error);
      }
    }
  }
}
```

### 6. Analytics and Continuous Improvement

#### Current:
Basic error logging and metrics

#### Enhanced:
Comprehensive analytics system for quality monitoring:

```typescript
interface ConversationAnalytics {
  userSatisfactionSignals: {
    messageLength: number[];       // Trend of user message lengths
    responseTime: number[];        // How quickly user responds
    sentimentTrend: number[];      // Trend of sentiment scores
    sessionDuration: number;       // How long sessions last
    returnRate: number;            // How often user returns
  };
  
  modelPerformance: {
    responseLatency: number[];     // Model response times
    tokensUsed: number;            // Token consumption
    fallbackRate: number;          // How often fallbacks occur
    contextTruncationRate: number; // Rate of context truncation
  };
  
  conversationQuality: {
    topicCohesion: number;         // How well topics connect
    questionAnswerRatio: number;   // Balance of questions/answers
    insightGeneration: number;     // Insights provided per session
  };
}
```

This data would feed into a continuous improvement system that adjusts processing strategies based on performance.

## Implementation Path

1. **Phase 1: Code Consolidation**
   - Merge `src` and `src2` into a unified codebase
   - Extract common patterns and eliminate duplication
   - Standardize interfaces between components

2. **Phase 2: Core Architecture Transition**
   - Implement the messaging bus architecture
   - Create state machine for conversation management
   - Develop enhanced context management system

3. **Phase 3: Advanced Features**
   - Implement dynamic LLM selection
   - Add asynchronous processing with proper orchestration
   - Integrate analytics system

4. **Phase 4: Optimization and Scaling**
   - Add caching layers for common responses
   - Implement session serialization for persistence
   - Add horizontal scaling capabilities

## Expected Benefits

1. **Improved User Experience**
   - 40-50% reduction in response latency
   - More contextually appropriate responses
   - Better handling of complex conversational scenarios

2. **Operational Improvements**
   - 30% reduction in token usage through smarter model selection
   - More resilient operation with graceful degradation
   - Better insights into system performance

3. **Development Efficiency**
   - Cleaner architecture with standardized interfaces
   - Better testability through component isolation
   - Easier to extend with new capabilities

4. **Clinical Effectiveness**
   - More consistent therapeutic approach
   - Better tracking of user progress
   - Enhanced safety with multi-layered protective measures