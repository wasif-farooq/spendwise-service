import { Container } from '@di/Container';
import { WorkspaceRequestRepository } from '@domains/workspaces/repositories/WorkspaceRequestRepository';
import { WorkspaceRolesController } from '@domains/workspaces/controllers/WorkspaceRolesController';
import { WorkspaceRequestRepositoryFactory } from '@domains/workspaces/repositories/WorkspaceRequestRepositoryFactory';
import { SubscriptionRequestRepositoryFactory } from '@domains/subscription/repositories/SubscriptionRequestRepositoryFactory';

export class WorkspaceRolesControllerFactory {
    private static instance: WorkspaceRolesController | null = null;

    create(): WorkspaceRolesController {
        if (WorkspaceRolesControllerFactory.instance) {
            return WorkspaceRolesControllerFactory.instance;
        }

        const workspaceRequestRepoFactory = Container.getInstance()
            .resolve<WorkspaceRequestRepositoryFactory>('WorkspaceRequestRepositoryFactory');
        const subscriptionRequestRepoFactory = Container.getInstance()
            .resolve<SubscriptionRequestRepositoryFactory>('SubscriptionRequestRepositoryFactory');

        const workspaceRequestRepository = workspaceRequestRepoFactory.create();
        const subscriptionRequestRepository = subscriptionRequestRepoFactory.create();

        WorkspaceRolesControllerFactory.instance = new WorkspaceRolesController(
            workspaceRequestRepository,
            subscriptionRequestRepository
        );

        return WorkspaceRolesControllerFactory.instance;
    }
}