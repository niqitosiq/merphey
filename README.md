# Therapeutic Telegram Bot

A Domain-Driven Design implementation of a therapeutic conversation bot integrated with Telegram and powered by LLM technology.

## Features

- **Context-aware therapeutic guidance**: Analyzes conversations to provide relevant support
- **Adaptive therapeutic plans**: Dynamically adjusts approach based on user needs
- **Real-time risk assessment**: Identifies potential crisis situations and responds appropriately
- **Personalized communication styles**: Adapts language to user preferences
- **LLM-powered responses**: Utilizes language models for natural conversation

## Architecture

This project follows a Domain-Driven Design (DDD) architecture with clear separation of concerns:

- **Domain Layer**: Core business logic and entities
  - User Interaction
  - Risk Management
  - Plan Management
  - Context Analysis

- **Application Layer**: Orchestrates domain services for use cases
  - Message Processing
  - Plan Revision

- **Infrastructure Layer**: External integrations and technical implementations
  - Telegram Bot
  - LLM Integration
  - Data Persistence

- **Presentation Layer**: User interfaces and output formatting
  - Response Formatting
  - Bot Controllers

## Requirements

- Node.js 18+
- Telegram Bot Token (from BotFather)
- OpenAI API Key (or compatible LLM provider)

## Installation

### Local Development

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/therapeutic-telegram-bot.git
   cd therapeutic-telegram-bot
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a `.env` file from the example:
   ```bash
   cp .env.example .env
   ```
   Then edit `.env` with your Telegram token and OpenAI API key.

4. Start the bot in development mode:
   ```bash
   npm run dev
   ```

### Docker Deployment

1. Build and start with Docker Compose:
   ```bash
   docker-compose up -d
   ```

## Configuration

Configure the bot via environment variables (see `.env.example`):

- `TELEGRAM_BOT_TOKEN`: Your Telegram bot token
- `OPENAI_API_KEY`: Your OpenAI API key
- `LOW_TIER_MODEL`: The model for less critical operations (default: gpt-3.5-turbo)
- `HIGH_TIER_MODEL`: The model for critical operations (default: gpt-4-turbo-preview)
- `WEBHOOK_URL`: (Optional) URL for webhook mode instead of polling
- `ENABLE_BACKGROUND_PROCESSING`: Enable/disable background analysis

## Usage

1. Start a conversation with your bot on Telegram
2. The bot will guide users through a therapeutic conversation flow:
   - Initial greeting and assessment
   - Therapeutic intervention based on context
   - Reflection and closure

## LLM Integration

The bot uses LLM technology for several key functions:

1. **Risk assessment**: Analyzing messages for potential crisis indicators
2. **Context analysis**: Understanding conversation themes and shifts
3. **Response generation**: Creating appropriate therapeutic responses
4. **Plan adaptation**: Revising therapeutic approaches based on user needs
5. **Communication styling**: Formatting messages to match user preferences

## Development

- Build the project: `npm run build`
- Run tests: `npm test`
- Lint code: `npm run lint`
- Format code: `npm run format`

## Security Considerations

This bot implements several safety measures:

- Risk level classification (Low, Moderate, High, Critical)
- Escalation protocols for high-risk situations
- Circuit breaker pattern for LLM failures
- Conservative fallbacks for error cases

## License

MIT License