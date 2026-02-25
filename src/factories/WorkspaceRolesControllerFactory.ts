import { ServiceFactory } from './ServiceFactory';
import { WorkspaceRequestRepository } from '@domains/workspaces/repositories/WorkspaceRequestRepository';
import { WorkspaceRolesController } from '@domains/workspaces/controllers/WorkspaceRolesController';

export class WorkspaceRolesControllerFactory {
    constructor(private serviceFactory: ServiceFactory) { }

    create(repository?: WorkspaceRequestRepository): WorkspaceRolesController {
        return new WorkspaceRolesController(repository || new WorkspaceRequestRepository());
    }
}
