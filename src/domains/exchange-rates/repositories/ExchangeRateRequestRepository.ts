import { ConfigLoader } from '@config/ConfigLoader';
import { DatabaseFacade } from '@facades/DatabaseFacade';
import { RepositoryFactory } from '@factories/RepositoryFactory';
import { ServiceFactory } from '@factories/ServiceFactory';
import { ExchangeRateService } from '../services/ExchangeRateService';
import { Container } from '@di/Container';
import { TOKENS } from '@di/tokens';
import { CRYPTO_CURRENCIES, SUPPORTED_FIAT_CURRENCIES } from '@domains/currencies/currencies';

export class ExchangeRateRequestRepository {
  private config = ConfigLoader.getInstance();

  private getMode(): string {
    return this.config.get('repository.mode') || 'direct';
  }

  private getService(): ExchangeRateService {
    const db = Container.getInstance().resolve<DatabaseFacade>(TOKENS.Database);
    const repoFactory = new RepositoryFactory(db);
    const serviceFactory = new ServiceFactory(repoFactory, db);
    return serviceFactory.createExchangeRateService();
  }

  private wrap(promise: Promise<any>): Promise<any> {
    return promise
      .then((data) => ({ data, error: null, statusCode: 200 }))
      .catch((error) => ({
        error: error.message || 'An error occurred',
        statusCode: error.statusCode || 500,
        data: null,
      }));
  }

  async getRates(baseCurrency?: string) {
    if (this.getMode() === 'direct') {
      const service = this.getService();
      return this.wrap(service.getRates(baseCurrency));
    }
    throw new Error('RPC mode not implemented');
  }

  async convert(amount: number, fromCurrency: string, toCurrency: string, _userId: string) {
    if (this.getMode() === 'direct') {
      const service = this.getService();
      return this.wrap(service.convert(amount, fromCurrency, toCurrency));
    }
    throw new Error('RPC mode not implemented');
  }

  async fetchRates(baseCurrency?: string) {
    if (this.getMode() === 'direct') {
      const service = this.getService();
      return this.wrap(
        (async () => {
          const fiat = await service.fetchAndStoreRates(baseCurrency || 'USD');
          const crypto = await service.fetchCryptoRates();
          return { ...fiat, crypto };
        })(),
      );
    }
    throw new Error('RPC mode not implemented');
  }

  getSupportedCurrencies(): string[] {
    return [...SUPPORTED_FIAT_CURRENCIES];
  }

  /** Crypto codes the rates cover (listed whether or not the `crypto` flag is on). */
  getSupportedCryptoCurrencies(): string[] {
    return CRYPTO_CURRENCIES.map((c) => c.code);
  }
}
