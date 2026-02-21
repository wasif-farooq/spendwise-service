import { ServiceFactory } from './ServiceFactory';
import { AccountController } from '@domains/accounts/controllers/AccountController';
import { AccountService } from '@domains/accounts/services/AccountService';
import { AccountRepository } from '@domains/accounts/repositories/AccountRepository';
import { DatabaseFacade } from '@facades/DatabaseFacade';
import { TOKENS } from '@di/tokens';
import { Container } from '@di/Container';

export class AccountControllerFactory {
    private accountService: AccountService;

    constructor(private serviceFactory: ServiceFactory) {
        // Get database from container (same pattern as other factories)
        const db = Container.getInstance().resolve<DatabaseFacade>(TOKENS.Database);
        const accountRepository = new AccountRepository(db);
        this.accountService = new AccountService(accountRepository);
    }

    create(): AccountController {
        return new AccountController(this.accountService);
    }
}
