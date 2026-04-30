import { ExchangeRateRequestRepository } from './ExchangeRateRequestRepository';

export class ExchangeRateRequestRepositoryFactory {
    private static instance: ExchangeRateRequestRepository | null = null;

    create(): ExchangeRateRequestRepository {
        if (ExchangeRateRequestRepositoryFactory.instance) {
            return ExchangeRateRequestRepositoryFactory.instance;
        }

        ExchangeRateRequestRepositoryFactory.instance = new ExchangeRateRequestRepository();
        return ExchangeRateRequestRepositoryFactory.instance;
    }
}