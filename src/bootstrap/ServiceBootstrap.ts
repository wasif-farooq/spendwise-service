import { ConfigLoader } from '@config/ConfigLoader';
import { StructuredLogger } from '@monitoring/logging/StructuredLogger';
import { DatabaseFacade } from '@facades/DatabaseFacade';
import { MessagingFacade } from '@messaging/facades/MessagingFacade';
import { Container } from '@di/Container';
import { PostgresFactory } from '@database/factories/PostgresFactory';
import { KafkaMessageQueueFactory } from '@messaging/factories/KafkaMessageQueueFactory';
import { RepositoryFactory } from '@factories/RepositoryFactory';
import { ServiceFactory } from '@factories/ServiceFactory';
import { AuthControllerFactory } from '@factories/AuthControllerFactory';
import { WorkspaceControllerFactory } from '@factories/WorkspaceControllerFactory';
import { WorkspaceRolesControllerFactory } from '@factories/WorkspaceRolesControllerFactory';
import { UserControllerFactory } from '@factories/UserControllerFactory';
import { TOKENS } from '@di/tokens';
import { FeatureFlagControllerFactory } from '@factories/FeatureFlagControllerFactory';
import { AccountControllerFactory } from '@factories/AccountControllerFactory';
import { StorageControllerFactory } from '@factories/StorageControllerFactory';
import { TransactionControllerFactory } from '@factories/TransactionControllerFactory';
import { CategoryControllerFactory } from '@factories/CategoryControllerFactory';
import { ExchangeRateControllerFactory } from '@factories/ExchangeRateControllerFactory';
import { SubscriptionControllerFactory } from '@factories/SubscriptionControllerFactory';
import { PaymentControllerFactory } from '@factories/PaymentControllerFactory';
import { AnalyticsControllerFactory } from '@factories/AnalyticsControllerFactory';
import { ReportControllerFactory } from '@factories/ReportControllerFactory';
import { SettingsControllerFactory } from '@factories/SettingsControllerFactory';
import { AccountRepository } from '@domains/accounts/repositories/AccountRepository';
import { AccountService } from '@domains/accounts/services/AccountService';
import { TransactionRepository } from '@domains/transactions/repositories/TransactionRepository';
import { TransactionService } from '@domains/transactions/services/TransactionService';
import { TransactionController } from '@domains/transactions/controllers/TransactionController';
import { ExchangeRateRepository } from '@domains/exchange-rates/repositories/ExchangeRateRepository';
import { ExchangeRateService } from '@domains/exchange-rates/services/ExchangeRateService';
import { AnalyticsService } from '@domains/analytics/services/AnalyticsService';
import analyticsRoutes from '@domains/analytics/routes/analytics.routes';
import { CategoryRepository } from '@domains/categories/repositories/CategoryRepository';
import { CategoryService } from '@domains/categories/services/CategoryService';
import { StorageRepository } from '@domains/storage/repositories/StorageRepository';
import { StorageService } from '@domains/storage/services/StorageService';
import { StorageController } from '@domains/storage/controllers/StorageController';

export class ServiceBootstrap {
    private static instance: ServiceBootstrap;
    private logger: StructuredLogger;
    private container: Container;

    private constructor() {
        this.logger = new StructuredLogger();
        this.container = Container.getInstance();
    }

    public static getInstance(): ServiceBootstrap {
        if (!ServiceBootstrap.instance) {
            ServiceBootstrap.instance = new ServiceBootstrap();
        }
        return ServiceBootstrap.instance;
    }

    public async initialize(serviceName: string): Promise<void> {
        try {
            this.logger.info(`Initializing ${serviceName}...`);

            // Load Config
            ConfigLoader.getInstance();

            // Register Core Facades in Container
            this.container.registerInstance(TOKENS.Config, ConfigLoader.getInstance());
            this.container.registerInstance(TOKENS.Logger, this.logger); // Use standard Logger interface if possible

            const dbFactory = new PostgresFactory();
            const dbFacade = new DatabaseFacade(dbFactory);
            this.container.registerInstance(TOKENS.Database, dbFacade);

            const msgFactory = new KafkaMessageQueueFactory();
            const msgFacade = new MessagingFacade(msgFactory);
            this.container.registerInstance(TOKENS.Messaging, msgFacade);

            // Register Application Factories
            const repoFactory = new RepositoryFactory(dbFacade);
            this.container.registerInstance(TOKENS.RepositoryFactory, repoFactory);

            const serviceFactory = new ServiceFactory(repoFactory, dbFacade);
            this.container.registerInstance(TOKENS.ServiceFactory, serviceFactory);

            const authControllerFactory = new AuthControllerFactory(serviceFactory);
            this.container.registerInstance(TOKENS.AuthControllerFactory, authControllerFactory);

            const userControllerFactory = new UserControllerFactory(serviceFactory);
            this.container.registerInstance(TOKENS.UserControllerFactory, userControllerFactory);

            const workspaceControllerFactory = new WorkspaceControllerFactory();
            this.container.registerInstance(TOKENS.WorkspaceControllerFactory, workspaceControllerFactory);

            const featureFlagControllerFactory = new FeatureFlagControllerFactory(serviceFactory);
            this.container.registerInstance(TOKENS.FeatureFlagControllerFactory, featureFlagControllerFactory);

            const workspaceRolesControllerFactory = new WorkspaceRolesControllerFactory();
            this.container.registerInstance(TOKENS.WorkspaceRolesControllerFactory, workspaceRolesControllerFactory);

            const userPreferencesService = serviceFactory.createUserPreferencesService();
            this.container.registerInstance(TOKENS.UserPreferencesService, userPreferencesService);

            const authService = serviceFactory.createAuthService();
            this.container.registerInstance(TOKENS.AuthService, authService);

            const workspaceService = serviceFactory.createWorkspaceService();
            this.container.registerInstance(TOKENS.WorkspaceService, workspaceService);

            const userService = serviceFactory.createUserService();
            this.container.registerInstance(TOKENS.UserService, userService);

            const featureFlagService = serviceFactory.createFeatureFlagService();
            this.container.registerInstance(TOKENS.FeatureFlagService, featureFlagService);

            const subPlanRepo = repoFactory.createSubscriptionPlanRepository();
            this.container.registerInstance(TOKENS.SubscriptionPlanRepository, subPlanRepo);

            const userSubRepo = repoFactory.createUserSubscriptionRepository();
            this.container.registerInstance(TOKENS.UserSubscriptionRepository, userSubRepo);

            // User Repository (used by PaymentController)
            const userRepo = repoFactory.createUserRepository();
            this.container.registerInstance('UserRepository', userRepo);

            const subscriptionService = serviceFactory.createSubscriptionService();
            this.container.registerInstance(TOKENS.SubscriptionService, subscriptionService);

            // Account domain registrations
            const accountRepo = new AccountRepository(dbFacade);
            this.container.registerInstance(TOKENS.AccountRepository, accountRepo);

            // Transaction domain registrations (must be before AccountController)
            const transactionRepo = new TransactionRepository(dbFacade);
            this.container.registerInstance(TOKENS.TransactionRepository, transactionRepo);

            // Exchange rate domain
            const exchangeRateRepo = new ExchangeRateRepository(dbFacade);
            this.container.registerInstance(TOKENS.ExchangeRateRepository, exchangeRateRepo);
            const exchangeRateService = new ExchangeRateService(exchangeRateRepo);

            const transactionService = new TransactionService(transactionRepo, accountRepo, dbFacade, exchangeRateService);
            this.container.registerInstance(TOKENS.TransactionService, transactionService);

            const accountService = new AccountService(accountRepo, exchangeRateService);
            this.container.registerInstance(TOKENS.AccountService, accountService);

            const accountControllerFactory = new AccountControllerFactory();
            this.container.registerInstance(TOKENS.AccountController, accountControllerFactory.create());

            const transactionControllerFactory = new TransactionControllerFactory();
            this.container.registerInstance(TOKENS.TransactionController, transactionControllerFactory.create());

            // Analytics domain
            const analyticsService = await serviceFactory.createAnalyticsService();
            this.container.registerInstance(TOKENS.AnalyticsService, analyticsService);

            // Category domain registrations (required by WorkspaceService for default categories)
            const categoryRepo = new CategoryRepository(dbFacade);
            this.container.registerInstance(TOKENS.CategoryRepository, categoryRepo);

            const categoryService = new CategoryService(categoryRepo, transactionRepo);
            this.container.registerInstance(TOKENS.CategoryService, categoryService);

            // Storage domain registrations
            const storageRepo = new StorageRepository(dbFacade);
            this.container.registerInstance(TOKENS.StorageRepository, storageRepo);

            const storageService = new StorageService(storageRepo, ConfigLoader.getInstance());
            this.container.registerInstance(TOKENS.StorageService, storageService);
            
            // Initialize storage buckets (create if not exist)
            try {
                await storageService.initializeBuckets();
            } catch (error) {
                console.log('Bucket initialization warning:', error);
            }

            const storageControllerFactory = new StorageControllerFactory();
            const storageController = storageControllerFactory.create();
            this.container.registerInstance(TOKENS.StorageController, storageController);

            // Payment domain registrations
            const paymentRepo = repoFactory.createPaymentRepository();
            this.container.registerInstance(TOKENS.PaymentRepository, paymentRepo);

            // PaymentService is a singleton, get instance directly
            const { PaymentService } = require('@domains/payment/services/PaymentService');
            this.container.registerInstance(TOKENS.PaymentService, PaymentService.getInstance());

            // Connect Infrastructure
            // await dbFacade.connect(); // Optional based on service
            // await msgFacade.connect();

            this.logger.info(`${serviceName} initialized successfully.`);
        } catch (error: any) {
            this.logger.error(`Failed to initialize ${serviceName}`, error.stack);
            process.exit(1);
        }
    }
}
