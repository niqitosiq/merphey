import { MentalHealthApplication } from './MentalHealthApplication';
import { startTelegramBot } from '../infrastructure/telegram/bot/TelegramBot';
import { LLMAdapter } from '../infrastructure/llm/openai/LLMAdapter';
import { ConversationRepository } from '../infrastructure/persistence/postgres/ConversationRepository';
import { TherapeuticPlanRepository } from '../infrastructure/persistence/postgres/PlanRepository';
import { PlanEvolutionService } from '../domain/aggregates/therapy/services/PlanEvolutionService';
import { RiskAssessor } from '../domain/services/risk/RiskAssessmentService';
import { ContextAnalyzer } from '../domain/services/analysis/CognitiveAnalysisService';
import { StateTransitionService } from '../domain/services/state/StateTransitionService';
import { TransitionValidator } from '../domain/services/state/TransitionValidator';
import { CrisisDetector } from '../domain/services/risk/CrisisDetector';
import { PrismaClient } from '@prisma/client';
import { ConversationService } from './services/ConversationService';
import { MessageValidator } from '../shared/utils/safety-filter';
import { MessageFactory } from '../domain/aggregates/conversation/entities/MessageFactory';
import { GptResponseGenerator } from '../infrastructure/llm/openai/GptResponseGenerator';
import { ProgressTracker, ResponseComposer } from './services/ProgressTracker';
import { ErrorHandler } from '../shared/errors/application-errors';
import { RiskModel } from '../domain/services/risk/RiskModel';
import { UserRepository } from '../infrastructure/persistence/postgres/UserRepository';
import { EventBus } from '../shared/events/EventBus';

async function bootstrap() {
  try {
    // Initialize Prisma client
    const prisma = new PrismaClient();
    await prisma.$connect();

    // Initialize LLM adapter
    const llmAdapter = new LLMAdapter(
      process.env.OPENROUTER_API_KEY || '',
      process.env.DEFAULT_MODEL || 'google/gemini-2.0-flash-001',
    );

    // Initialize repositories
    const conversationRepository = new ConversationRepository();
    const therapeuticPlanRepository = new TherapeuticPlanRepository();
    const userRepository = new UserRepository();

    // Initialize domain services
    const messageValidator = new MessageValidator();
    const messageFactory = new MessageFactory();
    const crisisDetector = new CrisisDetector(llmAdapter);
    const riskModel = new RiskModel();
    const riskAssessor = new RiskAssessor(llmAdapter, crisisDetector, riskModel);
    const contextAnalyzer = new ContextAnalyzer(llmAdapter);
    const stateManager = new StateTransitionService(llmAdapter, new TransitionValidator());
    const responseGenerator = new GptResponseGenerator(llmAdapter);
    const planService = new PlanEvolutionService(therapeuticPlanRepository, llmAdapter);
    const conversationService = new ConversationService(
      conversationRepository,
      therapeuticPlanRepository,
      userRepository,
      planService,
    );
    const progressTracker = new ProgressTracker();
    const responseComposer = new ResponseComposer();
    const errorHandler = new ErrorHandler();
    const eventBus = new EventBus();

    // Initialize main application
    const application = new MentalHealthApplication(
      conversationService,
      messageValidator,
      messageFactory,
      riskAssessor,
      contextAnalyzer,
      stateManager,
      responseGenerator,
      planService,
      progressTracker,
      responseComposer,
      errorHandler,
      eventBus,
    );

    // Initialize and start Telegram bot
    const bot = startTelegramBot(application, eventBus);

    console.log('PsychoBot is running! 🤖');
  } catch (error) {
    console.error('Failed to start the application:', error);
    process.exit(1);
  }
}

// Start the application
bootstrap();
