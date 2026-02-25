import { ServiceFactory } from './ServiceFactory';
import { WorkspaceRequestRepository } from '@domains/workspaces/repositories/WorkspaceRequestRepository';
import { WorkspaceController } from '@domains/workspaces/controllers/WorkspaceController';

export class WorkspaceControllerFactory {
    constructor(private serviceFactory: ServiceFactory) { }

    create(repository?: WorkspaceRequestRepository): WorkspaceController {
        return new WorkspaceController(repository || new WorkspaceRequestRepository());
    }
}
