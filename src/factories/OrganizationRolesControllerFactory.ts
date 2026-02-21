import { ServiceFactory } from './ServiceFactory';
import { OrganizationRequestRepository } from '@domains/organizations/repositories/OrganizationRequestRepository';
import { OrganizationRolesController } from '@domains/organizations/controllers/OrganizationRolesController';

export class OrganizationRolesControllerFactory {
    constructor(private serviceFactory: ServiceFactory) { }

    create(repository?: OrganizationRequestRepository): OrganizationRolesController {
        return new OrganizationRolesController(repository || new OrganizationRequestRepository());
    }
}
