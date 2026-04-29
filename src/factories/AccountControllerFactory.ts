import { ServiceFactory } from './ServiceFactory';
import { AccountController } from '@domains/accounts/controllers/AccountController';
import { AccountService } from '@domains/accounts/services/AccountService';
import { AccountRepository } from '@domains/accounts/repositories/AccountRepository';
import { DatabaseFacade } from '@facades/DatabaseFacade';
import { TOKENS } from '@di/tokens';
import { Container } from '@di/Container';
import { ExchangeRateService } from '@domains/exchange-rates/services/ExchangeRateService';
import { ExchangeRateRepository } from '@domains/exchange-rates/repositories/ExchangeRateRepository';

export class AccountControllerFactory {
    private accountService: AccountService;

    constructor(private serviceFactory: ServiceFactory) {
        const db = Container.getInstance().resolve<DatabaseFacade>(TOKENS.Database);
        const accountRepository = new AccountRepository(db);
        const exchangeRateRepository = new ExchangeRateRepository(db);
        const exchangeRateService = new ExchangeRateService(exchangeRateRepository);
        this.accountService = new AccountService(accountRepository, exchangeRateService);
    }

    create(): AccountController {
        return new AccountController(this.accountService);
    }
}
