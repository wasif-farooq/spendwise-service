import { ServiceFactory } from './ServiceFactory';
import { AuthController } from '@domains/auth/controllers/AuthController';

import { AuthRequestRepository } from '@domains/auth/repositories/AuthRequestRepository';

export class AuthControllerFactory {
    constructor(private serviceFactory: ServiceFactory) { }

    create(repository?: AuthRequestRepository): AuthController {
        return new AuthController(repository || new AuthRequestRepository());
    }
}
