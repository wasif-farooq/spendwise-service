import { ServiceFactory } from './ServiceFactory';
import { OrganizationRequestRepository } from '@domains/organizations/repositories/OrganizationRequestRepository';
import { OrganizationController } from '@domains/organizations/controllers/OrganizationController';

export class OrganizationControllerFactory {
    constructor(private serviceFactory: ServiceFactory) { }

    create(repository?: OrganizationRequestRepository): OrganizationController {
        return new OrganizationController(repository || new OrganizationRequestRepository());
    }
}
