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
import { OrganizationControllerFactory } from '@factories/OrganizationControllerFactory';
import { OrganizationRolesControllerFactory } from '@factories/OrganizationRolesControllerFactory';
import { UserControllerFactory } from '@factories/UserControllerFactory';
import { TOKENS } from '@di/tokens';
import { FeatureFlagControllerFactory } from '@factories/FeatureFlagControllerFactory';
import { AccountControllerFactory } from '@factories/AccountControllerFactory';
import { AccountRepository } from '@domains/accounts/repositories/AccountRepository';
import { AccountService } from '@domains/accounts/services/AccountService';

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

            const organizationControllerFactory = new OrganizationControllerFactory(serviceFactory);
            this.container.registerInstance(TOKENS.OrganizationControllerFactory, organizationControllerFactory);

            const featureFlagControllerFactory = new FeatureFlagControllerFactory(serviceFactory);
            this.container.registerInstance(TOKENS.FeatureFlagControllerFactory, featureFlagControllerFactory);

            const organizationRolesControllerFactory = new OrganizationRolesControllerFactory(serviceFactory);
            this.container.registerInstance(TOKENS.OrganizationRolesControllerFactory, organizationRolesControllerFactory);

            const userPreferencesService = serviceFactory.createUserPreferencesService();
            this.container.registerInstance(TOKENS.UserPreferencesService, userPreferencesService);

            const authService = serviceFactory.createAuthService();
            this.container.registerInstance(TOKENS.AuthService, authService);

            const organizationService = serviceFactory.createOrganizationService();
            this.container.registerInstance(TOKENS.OrganizationService, organizationService);

            const userService = serviceFactory.createUserService();
            this.container.registerInstance(TOKENS.UserService, userService);

            const featureFlagService = serviceFactory.createFeatureFlagService();
            this.container.registerInstance(TOKENS.FeatureFlagService, featureFlagService);

            const subPlanRepo = repoFactory.createSubscriptionPlanRepository();
            this.container.registerInstance(TOKENS.SubscriptionPlanRepository, subPlanRepo);

            const orgSubRepo = repoFactory.createOrganizationSubscriptionRepository();
            this.container.registerInstance(TOKENS.OrganizationSubscriptionRepository, orgSubRepo);

            const subscriptionService = serviceFactory.createSubscriptionService();
            this.container.registerInstance(TOKENS.SubscriptionService, subscriptionService);

            // Account domain registrations
            const accountRepo = new AccountRepository(dbFacade);
            this.container.registerInstance(TOKENS.AccountRepository, accountRepo);

            const accountService = new AccountService(accountRepo);
            this.container.registerInstance(TOKENS.AccountService, accountService);

            const accountControllerFactory = new AccountControllerFactory(serviceFactory);
            this.container.registerInstance(TOKENS.AccountController, accountControllerFactory.create());


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
