import { ServiceFactory } from './ServiceFactory';
import { UserRequestRepository } from '@domains/users/repositories/UserRequestRepository';
import { UserController } from '@domains/users/controllers/UserController';

export class UserControllerFactory {
    constructor(private serviceFactory: ServiceFactory) { }

    create(repository?: UserRequestRepository): UserController {
        return new UserController(repository || new UserRequestRepository());
    }
}
