# PsychoBot - Psychological Counseling Bot

A sophisticated psychological counseling bot built with TypeScript that leverages AI models (OpenAI/Gemini) to provide therapeutic conversations through Telegram.

## 🌟 Features

- Natural language therapeutic conversations
- Multi-provider AI support (OpenAI/Gemini)
- Structured psychological analysis
- Session management and conversation history
- Personalized homework assignments
- Therapeutic story generation
- Crisis detection and management
- Multi-language support with emoji-enhanced communication

## 🔄 Program Flow

### 1. User Interaction Flow
1. User starts conversation via Telegram (/start command)
2. TelegramBotService creates new session
3. CommunicatorService initiates conversation
4. User sends message
5. Message processed through psychological analysis pipeline
6. Response generated and sent back to user

### 2. Message Processing Pipeline
1. User message received by TelegramBotService
2. Message routed to CommunicatorService
3. CommunicatorService evaluates need for psychological analysis
4. If needed, PsychologistService performs analysis
5. Response generated based on analysis
6. Multiple messages may be sent for complex responses

### 3. Session Management
1. Session created on first interaction
2. Conversation history maintained throughout session
3. Session state tracked for conversation context
4. Session can be reset or terminated based on conditions

## 🏗 Component Architecture

### Domain Layer

#### Entities (`src/domain/entities/`)

1. **Conversation (`conversation.ts`)**
   - Defines conversation data structures
   - Manages conversation step types
   - Handles message formats
   - Contains tag definitions for:
     - CommunicatorTags (NEED_GUIDANCE, DEEP_EMOTION, etc.)
     - PsychologistTags (CONTINUE, ADJUST_APPROACH, etc.)
     - SessionTags (SCHEDULE_FOLLOWUP, URGENT_FOLLOWUP, etc.)

2. **UserSession (`user-session.ts`)**
   - Manages user session state
   - Tracks conversation progress
   - Handles question/answer flow
   - Contains session factory for creation
   - Manages conversation plan execution

#### Services (`src/domain/services/`)

1. **CommunicatorService (`communicator.service.ts`)**
   - Primary interface for user interaction
   - Manages conversation flow
   - Features:
     - Conversation initialization
     - Message processing
     - Tag handling
     - Response generation
     - Crisis detection
   - Coordinates with PsychologistService

2. **PsychologistService (`psychologist.service.ts`)**
   - Handles psychological analysis
   - Manages:
     - Situation analysis
     - Session finalization
     - Therapeutic recommendations
     - Crisis protocol execution
   - Generates:
     - Analysis reports
     - Homework assignments
     - Therapeutic stories

#### Repositories (`src/domain/repositories/`)

**UserSessionRepository (`user-session.repository.ts`)**
- Manages session data persistence
- Provides CRUD operations for sessions
- Implements caching mechanism
- Handles session retrieval by various criteria

### Infrastructure Layer

#### Configuration (`src/infrastructure/config/`)

**Config Management (`index.ts`)**
- Environment configuration
- Provider settings (OpenAI/Gemini)
- Telegram bot configuration
- Application parameters
- Validation logic

#### LLM Integration (`src/infrastructure/llm/`)

1. **Conversation Processors (`conversation-processors.ts`)**
   - Implements AI provider interfaces
   - Manages:
     - OpenAI integration
     - Gemini integration
     - Response generation
     - Context management
   - Process types:
     - Initial analysis
     - Question generation
     - Final analysis
     - Homework generation
     - Story generation

2. **Conversation Prompts (`prompts/conversation.prompts.ts`)**
   - Defines structured prompts for:
     - Question generation
     - Conversation planning
     - Analysis generation
     - Homework creation
     - Story composition
   - Maintains prompt templates

#### Telegram Integration (`src/infrastructure/telegram/`)

**TelegramBotService (`telegram-bot.service.ts`)**
- Handles Telegram bot setup
- Manages:
  - Command handling
  - Message processing
  - Error handling
  - Session management
- Features:
  - Command support (/start, /reset, /help)
  - Message typing indicators
  - Graceful error handling
  - Production/Development mode support

### Utils Layer (`src/utils/`)

1. **ErrorBoundary (`error-boundary.ts`)**
   - Comprehensive error handling
   - Error severity classification
   - Context preservation
   - Metric recording
   - Error mapping

2. **LLM Error Handler (`llm-error-handler.ts`)**
   - Specialized AI error handling
   - Rate limiting management
   - Authentication error handling
   - Request validation

3. **Logger (`logger.ts`)**
   - Structured logging system
   - Environment-aware logging
   - Context preservation
   - Multiple log levels
   - Conversation step logging

4. **Metrics (`metrics.ts`)**
   - Performance monitoring
   - Usage statistics
   - Timer management
   - Metric aggregation
   - Analysis tools

## 🔄 Data Flow

1. **User Input Processing**
```
User → Telegram → TelegramBotService → CommunicatorService → Message Analysis
```

2. **Psychological Analysis**
```
Message → PsychologistService → AI Provider → Analysis → Response Generation
```

3. **Session Management**
```
User Session → Repository → Cache → State Management → Session Updates
```

4. **Response Generation**
```
Analysis → CommunicatorService → Response Formatting → TelegramBotService → User
```

## 🚀 Getting Started

### Prerequisites
- Node.js >= 18.0.0
- npm

### Installation

1. Clone the repository
2. Install dependencies:
```bash
npm install
```

3. Configure environment variables:
Copy `.env.example` to `.env` and fill in:
- AI provider credentials (OpenAI/Gemini)
- Telegram bot token
- Application settings

### Running the Bot

Development mode:
```bash
npm run dev
```

Production mode:
```bash
npm run start:prod
```

## 🛠 Technical Features

### AI Integration
- Dual provider support (OpenAI/Gemini)
- Specialized prompt engineering
- Context-aware responses
- Temperature-controlled output
- Automatic provider fallback

### Conversation Management
- Structured therapeutic dialogue
- Session state tracking
- Crisis detection
- Progress monitoring
- Context preservation

### Error Handling
- Comprehensive error boundary system
- Severity-based error classification
- Graceful degradation
- Error recovery strategies

### Monitoring
- Performance metrics
- Session analytics
- Error tracking
- Memory usage monitoring
- Response time analysis

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Open a Pull Request

## 📝 License

ISC License

## 🔒 Security

This bot implements several security measures:
- Environment-based configuration
- Input validation
- Error boundaries
- Session management

## ⚙️ Configuration

The bot can be configured through environment variables:

### AI Configuration
```env
AI_PROVIDER=openai|gemini
AZURE_OPENAI_API_KEY=your-key
AZURE_OPENAI_ENDPOINT=your-endpoint
AZURE_OPENAI_API_VERSION=2023-12-01-preview
GEMINI_API_KEY=your-key
```

### Telegram Configuration
```env
TELEGRAM_BOT_TOKEN=your-token
TELEGRAM_WEBHOOK_URL=your-webhook-url
```

### Application Settings
```env
NODE_ENV=development|production
MAX_CONVERSATION_LENGTH=50
MAX_QUESTION_EXCHANGES=5
```

## 🔮 Prompt System Architecture

### Prompt Types

#### 1. Question Generation Prompt
- Purpose: Generates therapeutic questions based on psychological analysis
- Features:
  - Depth exploration of client situations
  - Emotion and thought uncovering
  - Natural progression structure
  - Self-reflection encouragement
- Output Format:
  ```
  Q: [Question text]
  P: [Therapeutic purpose]
  ```

#### 2. Conversation Plan Prompt
- Purpose: Creates structured therapeutic conversation plans
- Features:
  - Progressive depth management
  - Strategic question sequencing
  - Balance of clinical and emotional needs
  - Natural conversation flow
- Output Format: JSON structure with
  - Main topics and subtopics
  - Clinical and friendly question versions
  - Warning signals
  - Completion criteria

#### 3. Communicator Prompt
- Purpose: Manages user interaction style
- Features:
  - Multilingual support with emoji enhancement
  - Dynamic role switching (user/psychologist interaction)
  - Contextual response generation
  - Tag-based guidance system
- Tags:
  - NEED_GUIDANCE: Requests psychologist assistance
  - DEEP_EMOTION: Marks emotional responses
  - RESISTANCE: Indicates user hesitation
  - CRISIS: Flags critical situations
  - TOPIC_CHANGE: Notes conversation shifts

#### 4. Psychologist Analysis Prompt
- Purpose: Professional psychological assessment
- Features:
  - Standardized screening integration (DSM-5/ICD-11)
  - Psychoanalytic assessment framework
  - Method selection guidance
  - Structured output format
- Components:
  - Diagnostic tools (GAD-7, PHQ-9, PSS-10)
  - Life history research
  - Personalization strategies
  - Evidence-based method selection

#### 5. Final Analysis Prompt
- Purpose: Session conclusion and recommendations
- Features:
  - Comprehensive insight compilation
  - Progress evaluation
  - Future planning
  - Risk assessment
- Output: JSON structure with
  - Key insights
  - Progress evaluation
  - Future focus areas
  - Follow-up recommendations
  - Risk assessment results

#### 6. Homework Generation Prompt
- Purpose: Creates personalized therapeutic assignments
- Features:
  - Session insight reinforcement
  - Practical skill development
  - Self-reflection promotion
  - Progress tracking
- Tags:
  - REFLECTION: Introspective exercises
  - BEHAVIORAL: Action-based tasks
  - COGNITIVE: Thought pattern work
  - EMOTIONAL: Feeling awareness

#### 7. Story Generation Prompt
- Purpose: Creates therapeutic metaphorical stories
- Features:
  - Theme reflection
  - Perspective offering
  - Emotional resonance
  - Insight accessibility
- Tags:
  - INSIGHT: Understanding promotion
  - HOPE: Inspiration focus
  - COPING: Strategy teaching
  - GROWTH: Personal development

### Prompt Flow Integration

1. **Initial Interaction**
   - Communicator Prompt → Greeting and problem exploration
   - Question Generation Prompt → Initial assessment questions

2. **Analysis Phase**
   - Psychologist Analysis Prompt → Situation evaluation
   - Conversation Plan Prompt → Session structure creation

3. **Interaction Loop**
   - Communicator Prompt → User message handling
   - Question Generation Prompt → Follow-up questions
   - Psychologist Analysis Prompt → Progress monitoring

4. **Session Conclusion**
   - Final Analysis Prompt → Session evaluation
   - Homework Generation Prompt → Personal assignments
   - Story Generation Prompt → Therapeutic narrative

### Temperature Control
- High temperature (0.9): Story generation for creativity
- Medium temperature (0.7-0.8): Conversation and analysis
- Low temperature (0.6): Homework and structured outputs

### Context Management
- Conversation history preservation
- Tag-based state tracking
- Cross-prompt information sharing
- Progressive depth adjustment