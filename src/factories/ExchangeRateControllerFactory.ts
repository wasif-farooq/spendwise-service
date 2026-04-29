import { ExchangeRateController } from '@domains/exchange-rates/controllers/ExchangeRateController';
import { ExchangeRateRequestRepository } from '@domains/exchange-rates/repositories/ExchangeRateRequestRepository';

export class ExchangeRateControllerFactory {
    private exchangeRateRequestRepository: ExchangeRateRequestRepository;

    constructor() {
        this.exchangeRateRequestRepository = new ExchangeRateRequestRepository();
    }

    create(): ExchangeRateController {
        return new ExchangeRateController(this.exchangeRateRequestRepository);
    }
}