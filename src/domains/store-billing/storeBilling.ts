import { ConfigLoader } from '@config/ConfigLoader';
import { Container } from '@di/Container';
import { TOKENS } from '@di/tokens';
import { DatabaseFacade } from '@facades/DatabaseFacade';
import { RevenueCatClient } from './RevenueCatClient';
import { RevenueCatWebhookHandler } from './RevenueCatWebhookHandler';
import { SqlStoreBillingRepository, SubscriptionRow } from './StoreSubscriptionRepository';
import { StoreSubscriptionService } from './StoreSubscriptionService';

/** Wiring for the store-billing domain (config + DB from the container, built lazily). */

const config = () => ConfigLoader.getInstance();
const db = () => Container.getInstance().resolve<DatabaseFacade>(TOKENS.Database);

export function createStoreSubscriptionService(): StoreSubscriptionService {
  const key = config().get('revenuecat.secretApiKey');
  return new StoreSubscriptionService({
    repository: new SqlStoreBillingRepository(db()),
    client: key
      ? new RevenueCatClient({
          secretApiKey: key,
          apiUrl: config().get('revenuecat.apiUrl'),
          timeoutMs: config().get('revenuecat.timeoutMs'),
        })
      : null,
    acceptSandbox: config().get('revenuecat.acceptSandbox') === true,
  });
}

let handler: RevenueCatWebhookHandler | null = null;

export function getRevenueCatWebhookHandler(): RevenueCatWebhookHandler {
  if (!handler) {
    handler = new RevenueCatWebhookHandler(
      () => config().get('revenuecat.webhookAuth'),
      createStoreSubscriptionService,
    );
  }
  return handler;
}

/** The user's current subscription row (plan key, provider, store facts), or null. */
export function findCurrentSubscriptionRow(userId: string): Promise<SubscriptionRow | null> {
  return new SqlStoreBillingRepository(db()).findCurrent(userId);
}
