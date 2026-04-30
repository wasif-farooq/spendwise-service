import { Container } from '@di/Container';
import { ExchangeRateController } from '@domains/exchange-rates/controllers/ExchangeRateController';
import { ExchangeRateRequestRepositoryFactory } from '@domains/exchange-rates/repositories/ExchangeRateRequestRepositoryFactory';

export class ExchangeRateControllerFactory {
    private static instance: ExchangeRateController | null = null;

    create(): ExchangeRateController {
        if (ExchangeRateControllerFactory.instance) {
            return ExchangeRateControllerFactory.instance;
        }

        const exchangeRateRequestRepoFactory = Container.getInstance()
            .resolve<ExchangeRateRequestRepositoryFactory>('ExchangeRateRequestRepositoryFactory');

        const exchangeRateRequestRepository = exchangeRateRequestRepoFactory.create();

        ExchangeRateControllerFactory.instance = new ExchangeRateController(exchangeRateRequestRepository);

        return ExchangeRateControllerFactory.instance;
    }
}