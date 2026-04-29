import { WorkspaceRequestRepository } from '@domains/workspaces/repositories/WorkspaceRequestRepository';
import { WorkspaceController } from '@domains/workspaces/controllers/WorkspaceController';
import { SubscriptionRequestRepository } from '@domains/subscription/repositories/SubscriptionRequestRepository';

export class WorkspaceControllerFactory {
    private workspaceRequestRepository: WorkspaceRequestRepository;
    private subscriptionRequestRepository: SubscriptionRequestRepository;

    constructor() {
        this.workspaceRequestRepository = new WorkspaceRequestRepository();
        this.subscriptionRequestRepository = new SubscriptionRequestRepository();
    }

    create(): WorkspaceController {
        return new WorkspaceController(
            this.workspaceRequestRepository,
            this.subscriptionRequestRepository
        );
    }
}