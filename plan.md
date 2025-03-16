# PsychoBot: Mental Health Support Chatbot

## 1. How the Application Works

PsychoBot is a mental health support chatbot that utilizes domain-driven design architecture to provide therapeutic interactions. Here's how the system functions:

### Core Application Flow

1. **Message Processing Pipeline**
   - The client sends a user message via Telegram or another interface
   - The `MentalHealthApplication` handles this message through a structured pipeline:
     1. Retrieves user conversation context (history, risk profile, therapeutic plan)
     2. Validates and sanitizes input
     3. Creates a message domain entity
     4. Processes the message through cognitive and risk analysis
     5. Updates conversation state and persists changes
     6. Generates and returns therapeutic responses

2. **Risk Assessment**
   - Every message is evaluated for potential risk signals
   - Risk levels (LOW, MEDIUM, HIGH, CRITICAL) determine response urgency
   - Critical risk triggers an emergency intervention protocol
   - Risk history is tracked to identify trends over time (increasing, decreasing, stable, fluctuating)

3. **Therapeutic Planning**
   - Users receive dynamically evolving therapeutic plans
   - Plans are versioned to track progress and therapeutic evolution
   - New plan versions are created based on detected progress or setbacks
   - Plan recommendations are adjusted according to user responses

4. **Conversation State Management**
   - Conversations progress through distinct states:
     - INFO_GATHERING: Initial assessment of user needs
     - ACTIVE_GUIDANCE: Delivering therapeutic techniques
     - PLAN_REVISION: Evaluating and updating approaches
     - EMERGENCY_INTERVENTION: Managing crisis situations
     - SESSION_CLOSING: Summarizing progress and setting next steps

5. **Contextual Understanding**
   - The system builds and maintains context vectors from conversation history
   - Previous interactions inform future responses
   - Semantic understanding allows for coherent therapeutic progression

### Architecture

The system follows a domain-driven design with clean architecture principles:

- **Domain Layer**: Core business logic and entities (Conversation, TherapeuticPlan)
- **Application Layer**: Use cases and coordination services
- **Infrastructure Layer**: External integrations (Database, LLM, Telegram)
- **Shared**: Cross-cutting utilities and error handling

## 2. Current Implementation

### Domain Model

```
User
 ├─ Conversations[]
 └─ TherapeuticPlans[]
    
Conversation
 ├─ state (INFO_GATHERING, ACTIVE_GUIDANCE, etc.)
 ├─ Messages[]
 ├─ RiskAssessments[]
 └─ TherapeuticPlan (current)

Message
 ├─ content
 ├─ role (user/assistant)
 └─ metadata

RiskAssessment
 ├─ level (LOW, MEDIUM, HIGH, CRITICAL)
 ├─ factors[]
 └─ score

TherapeuticPlan
 ├─ PlanVersions[]
 └─ currentVersion

PlanVersion
 ├─ version (number)
 ├─ previousVersion (chain)
 ├─ nextVersions[]
 └─ content (JSON)
```

### Key Components

1. **MentalHealthApplication**
   - Main orchestrator of the therapeutic workflow
   - Handles message intake and processing
   - Coordinates multiple specialized services

2. **ConversationService**
   - Retrieves and maintains conversation context
   - Persists conversation flow and updates
   - Manages user session state

3. **Risk Management**
   - RiskAssessmentService evaluates message content for risk factors
   - CrisisDetector identifies emergency situations
   - EmergencyService handles critical risk interventions

4. **Therapeutic Planning**
   - PlanEvolutionService creates and revises therapeutic plans
   - Plan versioning maintains history of approaches
   - Progress tracking monitors therapeutic outcomes

5. **Response Generation**
   - GptResponseGenerator creates therapeutic responses
   - Uses OpenAI's capabilities with specialized prompt engineering
   - Contextual awareness through session history

## 3. Next Steps

### Immediate Priorities
 
1. **Complete Core Infrastructure**
   - Implement Telegram bot integration (MessageDispatcher, CommandHandler)
   - Set up proper error handling and logging infrastructure
   - Finalize database repositories for all domain entities

2. **Enhance User Experience**
   - Develop more sophisticated response templates
   - Implement conversation summarization for long interactions
   - Create session closing logic with progress reports

## 4. Implementation Order

1. Complete the ConversationRepository implementation
2. Implement TextMessageHandler and CommandHandler for Telegram
3. Enhance RiskAssessmentService with more sophisticated detection
4. Develop NotificationService for emergency alerts
5. Complete and test the CognitiveAnalysisService
6. Expand ProgressTracker with more detailed metrics
7. Implement comprehensive error handling

## 5. Example Usage Scenarios

### Initial Assessment

**User Input**: "Hi, I've been feeling really down since my girlfriend broke up with me last month. I can't sleep and I'm struggling at work."

**System Processing**:
- Creates conversation in INFO_GATHERING state
- Analyzes risk factors (sleep issues, work impact)
- Generates MEDIUM risk assessment (score: 0.65)
- Creates initial therapeutic plan for coping strategies
- Stores context for relationship loss and sleep issues

### Crisis Intervention

**User Input**: "I don't see the point anymore. Maybe everyone would be better off if I just ended things tonight."

**System Processing**:
- Detects CRITICAL risk level through keywords and sentiment
- Triggers emergency intervention protocol
- Stores message with crisis flags
- Provides immediate crisis resources and support

### Progress Tracking

**User Input**: "The breathing exercises helped, but I'm still having panic attacks when I see couples in public."

**System Processing**:
- Identifies partial progress and remaining challenges
- Creates new plan version with exposure therapy techniques
- Updates therapeutic approach while maintaining history
- Adjusts conversation state to reflect progress