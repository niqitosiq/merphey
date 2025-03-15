## the structure for my application:

```
src/
│
├── domain/               # Core business logic
│   ├── aggregates/
│   │   ├── conversation/       # Conversation root aggregate
│   │   │   ├── entities/       # Message, RiskAssessment
│   │   │   ├── value-objects/  # RiskScore, EngagementLevel
│   │   │   └── services/       # ConversationAnalysisService
│   │   │
│   │   └── therapy/            # TherapeuticPlan root aggregate
│   │       ├── entities/       # PlanVersion
│   │       ├── value-objects/  # Technique, ProgressMetrics
│   │       └── services/       # PlanEvolutionService
│   │
│   ├── services/         # Domain services
│   │   ├── risk/                # RiskAssessmentService
│   │   ├── state/               # StateTransitionService
│   │   └── analysis/            # CognitiveAnalysisService
│   │
│   └── ports/            # Interface definitions
│       ├── llm.port.ts           # LLM service interface
│       ├── storage.port.ts       # Repository interfaces
│       └── messaging.port.ts     # Notification interface
│
├── application/          # Use cases and coordination
│   ├── use-cases/
│   │   ├── message-processing/
│   │   │   ├── ProcessMessageUseCase.ts
│   │   │   └── HandleEmergencyUseCase.ts
│   │   └── therapy-management/
│   │       ├── RevisePlanUseCase.ts
│   │       └── GenerateSummaryUseCase.ts
│   │
│   └── services/        # Application services
│       ├── SessionOrchestrator.ts
│       └── ResponseCoordinator.ts
│
├── infrastructure/       # Technical implementation details
│   ├── llm/              # LLM integrations
│   │   ├── openai/       # OpenAI implementation
│   │   │   ├── GptAnalysisAdapter.ts
│   │   │   └── GptResponseGenerator.ts
│   │   │
│   │   ├── anthropic/    # Claude implementation
│   │   ├── local/        # Local model runner
│   │   └── llm-switcher/ # Model routing logic
│   │
│   ├── persistence/      # Database implementations
│   │   ├── postgres/     # PG repositories
│   │   │   ├── ConversationRepository.ts
│   │   │   └── PlanRepository.ts
│   │   └── redis/        # Caching layer
│   │
│   ├── telegram/         # Bot infrastructure
│   │   ├── bot/
│   │   │   ├── TelegramBot.ts       # Bot instance
│   │   │   └── MessageDispatcher.ts
│   │   └── handlers/
│   │       ├── TextMessageHandler.ts
│   │       └── CommandHandler.ts
│   │
│   └── config/           # Configuration
│       ├── llm-config.ts   # Model selection rules
│       └── risk-config.ts  # Thresholds and rules
│
├── interfaces/           # Presentation layer
│   ├── telegram/         # Bot presentation
│   │   ├── controllers/
│   │   │   ├── MessageController.ts
│   │   │   └── CommandController.ts
│   │   └── dtos/        # Data transfer objects
│   │
│   └── web/             # Future web interface
│
└── shared/              # Common utilities
    ├── utils/
    │   ├── context-loader.ts  # Conversation context
    │   └── safety-filter.ts   # Content moderation
    └── errors/
        ├── domain-errors.ts
        └── application-errors.ts
```



## Example of main application function
```
class MentalHealthApplication {
  // Primary application entry point
  async handleUserMessage(userId: string, message: string): Promise<SessionResponse> {
    try {
      // 1. Retrieve conversation context
      const context = await this.conversationService.getConversationContext(userId);
      
      // 2. Validate and preprocess input
      const sanitizedMessage = this.messageValidator.validateInput(message);
      
      // 3. Create message entity
      const userMessage = this.messageFactory.createMessage({
        content: sanitizedMessage,
        role: 'user',
        context: context.currentState
      });

      // 4. Core processing pipeline
      const processingResult = await this.processMessagePipeline(context, userMessage);

      // 5. Update conversation state
      const updatedContext = await this.conversationService.persistConversationFlow(
        context,
        userMessage,
        processingResult
      );

      // 6. Prepare response
      return this.responseComposer.createResponsePackage(
        processingResult,
        updatedContext
      );
      
    } catch (error) {
      return this.errorHandler.handleProcessingError(error, userId);
    }
  }

  // Core message processing pipeline
  private async processMessagePipeline(context: ConversationContext, message: UserMessage) {
    // Phase 1: Immediate risk analysis
    const riskAssessment = await this.riskAssessor.detectImmediateRisk(
      message.content,
      context.riskHistory
    );

    // Emergency handling
    if (riskAssessment.level === 'CRITICAL') {
      return this.emergencyService.handleCriticalSituation(context, message, riskAssessment);
    }

    // Phase 2: Contextual analysis
    const analysis = await this.contextAnalyzer.analyzeMessage(
      message,
      context.therapeuticPlan,
      context.history
    );

    // Phase 3: State management
    const stateTransition = await this.stateManager.determineStateTransition(
      context.currentState,
      analysis.insights
    );

    // Phase 4: Therapeutic response generation
    const therapeuticResponse = await this.responseGenerator.generateTherapeuticResponse(
      context.currentState,
      analysis,
      stateTransition
    );

    // Phase 5: Plan evolution
    const planUpdate = await this.planService.evaluatePlanRevision(
      context.therapeuticPlan,
      therapeuticResponse.insights
    );

    // Phase 6: Session progression
    const sessionProgress = this.progressTracker.calculateSessionMetrics(
      context.history,
      therapeuticResponse
    );

    return {
      riskAssessment,
      stateTransition,
      therapeuticResponse,
      planUpdate,
      sessionProgress
    };
  }
}

// Core Domain Services
class RiskAssessor {
  async detectImmediateRisk(message: string, history: RiskAssessment[]): Promise<RiskAssessment> {
    // 1. NLP-based sentiment analysis
    const sentiment = await this.nlpService.analyzeSentiment(message);
    
    // 2. Pattern matching for crisis keywords
    const crisisFlags = this.crisisDetector.scanForRiskPatterns(message);
    
    // 3. Historical risk trend analysis
    const riskTrend = this.riskModel.calculateTrend(history);
    
    // 4. Composite risk evaluation
    return this.riskModel.evaluateCompositeRisk(
      sentiment,
      crisisFlags,
      riskTrend
    );
  }
}

class TherapeuticPlanManager {
  async revisePlan(currentPlan: TherapeuticPlan, insights: AnalysisInsights): Promise<PlanRevision> {
    // 1. Check if revision needed
    if (!this.planEvaluator.requiresRevision(currentPlan, insights)) {
      return { revisionRequired: false };
    }

    // 2. Create new version
    const newVersion = this.planFactory.createNewVersion(
      currentPlan,
      insights.sessionInsights,
      insights.progressMetrics
    );

    // 3. Validate version consistency
    const validation = await this.planValidator.validateVersionChain(
      currentPlan.versions,
      newVersion
    );

    // 4. Apply version updates
    return this.planRepository.commitNewVersion(
      currentPlan.id,
      newVersion,
      validation.score
    );
  }
}

class StateTransitionEngine {
  async determineNextState(currentState: ConversationState, context: TransitionContext): Promise<StateTransition> {
    // 1. Check emergency override
    if (context.riskLevel === 'CRITICAL') {
      return this.emergencyTransition();
    }

    // 2. Evaluate state machine rules
    const rules = this.ruleRepository.getRulesForState(currentState);
    
    // 3. Apply business rules
    const evaluated = this.ruleEngine.evaluateRules(rules, context);
    
    // 4. Return valid transition
    return this.transitionValidator.validateTransition(
      currentState,
      evaluated.targetState
    );
  }
}

// Example Usage Flow (CBT Scenario)
const app = new MentalHealthApplication();
const response = await app.handleUserMessage("user123", 
  "I tried the thought record. Noticed I assume people think I'm boring, but at dinner two people laughed at my jokes!");

// System processes:
// 1. Retrieves conversation history with existing CBT plan
// 2. Detects progress markers and residual challenges
// 3. Creates new PlanVersion with evidence examination techniques
// 4. Updates risk assessment to MEDIUM
// 5. Generates response reinforcing cognitive restructuring
// 6. Prepares session metrics showing 40% progress
```



my schema

```
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum ConversationState {
  INFO_GATHERING
  ACTIVE_GUIDANCE
  PLAN_REVISION
  EMERGENCY_INTERVENTION
  SESSION_CLOSING
}

enum RiskLevel {
  LOW
  MEDIUM
  HIGH
  CRITICAL
}

model User {
  id               String            @id @default(uuid())
  conversations    Conversation[]
  therapeuticPlans TherapeuticPlan[]
  createdAt        DateTime          @default(now())
  updatedAt        DateTime          @updatedAt
}

model Conversation {
  id              String            @id @default(uuid())
  state           ConversationState @default(INFO_GATHERING)
  userId          String
  user            User              @relation(fields: [userId], references: [id])
  messages        Message[]
  riskAssessments RiskAssessment[]
  currentPlanId   String?
  therapeuticPlan TherapeuticPlan?  @relation(fields: [currentPlanId], references: [id])
  contextVector   String? // Stored as JSON or vector type
  createdAt       DateTime          @default(now())
  updatedAt       DateTime          @updatedAt

  @@index([userId])
}

model Message {
  id             String       @id @default(uuid())
  content        String
  role           String // 'user' or 'assistant'
  conversationId String
  conversation   Conversation @relation(fields: [conversationId], references: [id])
  metadata       Json? // Store guidance metadata
  createdAt      DateTime     @default(now())

  @@index([conversationId])
}

model RiskAssessment {
  id             String       @id @default(uuid())
  level          RiskLevel
  conversationId String
  conversation   Conversation @relation(fields: [conversationId], references: [id])
  factors        String[]
  score          Float
  createdAt      DateTime     @default(now())

  @@index([conversationId])
}

model TherapeuticPlan {
  id               String         @id @default(uuid())
  userId           String
  user             User           @relation(fields: [userId], references: [id])
  versions         PlanVersion[]  @relation("PlanVersions")
  currentVersion   PlanVersion?   @relation("CurrentVersion", fields: [currentVersionId], references: [id])
  currentVersionId String?        @unique // Add @unique here
  createdAt        DateTime       @default(now())
  updatedAt        DateTime       @updatedAt
  conversations    Conversation[]

  @@index([userId])
}

model PlanVersion {
  id                String           @id @default(uuid())
  version           Int
  planId            String
  therapeuticPlan   TherapeuticPlan  @relation("PlanVersions", fields: [planId], references: [id])
  previousVersion   PlanVersion?     @relation("VersionChain", fields: [previousVersionId], references: [id])
  previousVersionId String?
  nextVersions      PlanVersion[]    @relation("VersionChain")
  content           Json
  validationScore   Float?
  createdAt         DateTime         @default(now())
  currentOfPlan     TherapeuticPlan? @relation("CurrentVersion")

  @@index([planId])
}
```


The use cases:
Here are 6 comprehensive user stories based on your schema, demonstrating different system capabilities and potential edge cases:
1. Initial Risk Identification & Plan Creation

User Input:
"Hi, I've been feeling really down since my girlfriend broke up with me last month. I can't sleep and I'm struggling at work."

System Processing:

    Creates new Conversation in INFO_GATHERING state

    Analyzes message for risk factors (sleep issues, work impact)

    Generates RiskAssessment with MEDIUM risk level (score: 0.65)

    Creates initial TherapeuticPlan with coping strategies

    Stores context vector for relationship loss and sleep issues

Outcome:
typescript
Copy

// Conversation
{
  state: 'ACTIVE_GUIDANCE',
  riskAssessments: [{
    level: 'MEDIUM',
    factors: ['sleep_disturbance', 'work_impact'],
    score: 0.65
  }],
  therapeuticPlan: {
    versions: [{
      content: {
        goals: ['Improve sleep hygiene', 'Establish daily routine'],
        techniques: ['Cognitive restructuring']
      }
    }]
  }
}

2. Crisis Intervention Scenario

User Input:
"I don't see the point anymore. Maybe everyone would be better off if I just ended things tonight."

System Processing:

    Detects immediate CRITICAL risk through keywords and sentiment

    Creates Emergency Intervention record

    Triggers real-time human moderator alert

    Stores message metadata with crisis flags

    Locks conversation for safety protocols

Outcome:
typescript
Copy

// Conversation
{
  state: 'EMERGENCY_INTERVENTION',
  riskAssessments: [{
    level: 'CRITICAL',
    factors: ['suicidal_ideation', 'immediate_risk'],
    score: 0.92
  }],
  messages: [{
    content: "I don't see the point anymore...",
    metadata: {
      crisisFlags: ['suicidal_ideation', 'temporal_immediacy'],
      emergencyActions: ['human_alert_triggered']
    }
  }]
}

3. Progressive Plan Revision

User Input:
"The breathing exercises helped, but I'm still having panic attacks when I see couples in public."

System Processing:

    Identifies partial progress and residual symptoms

    Creates new PlanVersion (v2) with exposure therapy

    Updates TherapeuticPlan.currentVersion

    Maintains version chain with previous plan

    Adjusts context vector for public anxiety triggers

Outcome:
typescript
Copy

// TherapeuticPlan
{
  versions: [
    {version: 1, content: {techniques: ['breathing_exercises']}},
    {version: 2, content: {techniques: ['graded_exposure']}}
  ],
  currentVersionId: 'version_2_id'
}

4. Session Conclusion with Metrics

User Input:
"Thanks, I think I'm good for now. I'll try the journaling exercise you suggested."

System Processing:

    Analyzes conversation for completion markers

    Generates session summary metrics

    Creates closure message with progress recap

    Updates TherapeuticPlan validation score

    Preserves final context vector state

Outcome:
typescript
Copy

// Conversation
{
  state: 'SESSION_CLOSING',
  messages: [{
    content: "Session summary: 3 breakthroughs, 2 new techniques tried...",
    metadata: {
      metrics: {
        progressScore: 0.75,
        engagementLevel: 'HIGH'
      }
    }
  }]
}

5. Cross-Conversation Context Maintenance

User Input:
"Remember last week when we talked about my fear of crowds? I tried the exposure plan..."

System Processing:

    Retrieves previous conversation's contextVector

    Links to existing TherapeuticPlan versions

    Updates current plan with new outcomes

    Maintains version history across multiple sessions

Outcome:
typescript
Copy

// TherapeuticPlan
{
  versions: [
    {version: 1, content: {exposure_level: 'low'}},
    {version: 2, content: {exposure_level: 'medium'}}
  ],
  conversations: ['conv_1_id', 'conv_2_id']
}

6. Risk Level Fluctuation Pattern

User Input (over multiple messages):

    "I'm feeling better after using the grounding techniques" → LOW risk

    "But today I relapsed and self-harmed" → HIGH risk

    "Talked to my sister about it" → MEDIUM risk

System Processing:

    Maintains risk assessment history

    Tracks risk trend through multiple assessments

    Adjusts TherapeuticPlan based on fluctuation pattern

    Stores temporal risk progression

Outcome:
typescript
Copy

// RiskAssessment[]
[
  {level: 'LOW', score: 0.3, factors: ['positive_progress']},
  {level: 'HIGH', score: 0.8, factors: ['self_harm']},
  {level: 'MEDIUM', score: 0.55, factors: ['social_support']}
]

Potential Flow Logic Challenges:

    State Transition Conflicts: Emergency interventions needing to override ongoing guidance

    Version Consistency: Maintaining plan integrity across multiple concurrent conversations

    Context Vector Synchronization: Real-time updates vs historical preservation

    Risk Assessment Overrides: Handling conflicting risk signals in rapid succession

    Cross-Conversation Locking: Preventing plan version collisions during simultaneous sessions




Implementation order
High Priority (Core Functionality):

Message.ts

Core domain entity for messages
Required by almost all other components
Needed for basic message handling
ConversationRepository.ts

Essential for storing conversation state
Required to maintain user context
Implements core storage port
RiskAssessmentService.ts

Critical for user safety
Core risk evaluation logic
Required before any message processing
OpenAIAdapter.ts

Primary interface to LLM capabilities
Required for message analysis and response generation
Implements LLM port
Medium Priority (Essential Services):

StateTransitionService.ts

Manages conversation flow
Controls therapeutic progression
Required for structured interactions
SessionOrchestrator.ts

Coordinates conversation sessions
Manages context and state
Essential for multi-user support
src/infrastructure/telegram/bot/TelegramBot.ts

Main interface to Telegram
Required for bot functionality
Handles user interactions
safety-filter.ts

Input validation and sanitization
Security critical component
Required for safe operation
Lower Priority (Supporting Components):

TherapeuticPlan.ts

Therapeutic plan management
Enhances user experience
Supports long-term interaction
GptResponseGenerator.ts

Therapeutic response generation
Enhances response quality
Builds on OpenAIAdapter
CognitiveAnalysisService.ts

Advanced message understanding
Improves therapeutic responses
Enhances user experience
ResponseCoordinator.ts

Response formatting and delivery
Improves user interaction
Enhances message presentation
Final Phase:

EmergencyResponseGenerator.ts

Critical situation handling
Specialized response generation
Builds on core components
application-errors.ts

Error handling and recovery
System reliability
Operational safety
NotificationService.ts

Administrator notifications
Crisis alerts
System monitoring