import { Container } from '@di/Container';
import { WorkspaceRequestRepository } from '@domains/workspaces/repositories/WorkspaceRequestRepository';
import { WorkspaceController } from '@domains/workspaces/controllers/WorkspaceController';
import { SubscriptionRequestRepository } from '@domains/subscription/repositories/SubscriptionRequestRepository';
import { WorkspaceRequestRepositoryFactory } from '@domains/workspaces/repositories/WorkspaceRequestRepositoryFactory';
import { SubscriptionRequestRepositoryFactory } from '@domains/subscription/repositories/SubscriptionRequestRepositoryFactory';
import { AuthRequestRepositoryFactory } from '@domains/auth/repositories/AuthRequestRepositoryFactory';

export class WorkspaceControllerFactory {
    private static instance: WorkspaceController | null = null;

    create(): WorkspaceController {
        if (WorkspaceControllerFactory.instance) {
            return WorkspaceControllerFactory.instance;
        }

        const workspaceRequestRepoFactory = Container.getInstance()
            .resolve<WorkspaceRequestRepositoryFactory>('WorkspaceRequestRepositoryFactory');
        const subscriptionRequestRepoFactory = Container.getInstance()
            .resolve<SubscriptionRequestRepositoryFactory>('SubscriptionRequestRepositoryFactory');
        const authRequestRepoFactory = Container.getInstance()
            .resolve<AuthRequestRepositoryFactory>('AuthRequestRepositoryFactory');

        const workspaceRequestRepository = workspaceRequestRepoFactory.create();
        const subscriptionRequestRepository = subscriptionRequestRepoFactory.create();
        const authRequestRepository = authRequestRepoFactory.create();

        WorkspaceControllerFactory.instance = new WorkspaceController(
            workspaceRequestRepository,
            subscriptionRequestRepository,
            authRequestRepository
        );

        return WorkspaceControllerFactory.instance;
    }
}