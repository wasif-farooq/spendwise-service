import { WorkspaceRequestRepository } from '@domains/workspaces/repositories/WorkspaceRequestRepository';
import { WorkspaceRolesController } from '@domains/workspaces/controllers/WorkspaceRolesController';
import { SubscriptionRequestRepository } from '@domains/subscription/repositories/SubscriptionRequestRepository';

export class WorkspaceRolesControllerFactory {
    private workspaceRequestRepository: WorkspaceRequestRepository;
    private subscriptionRequestRepository: SubscriptionRequestRepository;

    constructor() {
        this.workspaceRequestRepository = new WorkspaceRequestRepository();
        this.subscriptionRequestRepository = new SubscriptionRequestRepository();
    }

    create(): WorkspaceRolesController {
        return new WorkspaceRolesController(
            this.workspaceRequestRepository,
            this.subscriptionRequestRepository
        );
    }
}