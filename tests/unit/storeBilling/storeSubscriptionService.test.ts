import { StoreSubscriptionService } from '@domains/store-billing/StoreSubscriptionService';
import { RevenueCatSubscriber } from '@domains/store-billing/storeState';
import { StoreBillingError } from '@domains/store-billing/subscriptionSource';
import { DAY, FakeStoreRepo, NOW, OTHER_USER_ID, PLANS, USER_ID, rcEvent } from './fakes';

const quiet = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };

function setup(
  options: {
    acceptSandbox?: boolean;
    subscriber?: RevenueCatSubscriber | Error | null;
    now?: Date;
  } = {},
) {
  const repo = new FakeStoreRepo();
  const getSubscriber = jest.fn(async () => {
    if (options.subscriber instanceof Error) throw options.subscriber;
    return options.subscriber ?? { subscriptions: {} };
  });
  const service = new StoreSubscriptionService({
    repository: repo,
    client: options.subscriber === null ? null : { getSubscriber },
    acceptSandbox: options.acceptSandbox ?? true,
    now: () => options.now ?? NOW,
    logger: quiet,
  });
  return { repo, service, getSubscriber };
}

describe('webhook: purchases and renewals', () => {
  it('INITIAL_PURCHASE makes Google Play the biller of the bought plan', async () => {
    const { repo, service } = setup();
    repo.seed(USER_ID, {});
    expect(
      await service.handleWebhookEvent(
        rcEvent({ type: 'INITIAL_PURCHASE', product_id: 'pro:yearly' }),
      ),
    ).toBe('applied');
    expect(repo.row()).toMatchObject({
      planId: PLANS.pro.id,
      planKey: 'pro',
      status: 'active',
      paymentProvider: 'google_play',
      merchantSubscriptionId: 'GPA.1111-2222-3333-44444',
      storeOriginalTransactionId: 'GPA.1111-2222-3333-44444',
      billingCycle: 'yearly',
      cancelAtPeriodEnd: false,
      storeProductId: 'pro:yearly',
      storeState: 'active',
      storeEnvironment: 'PRODUCTION',
      limitsSnapshot: PLANS.pro.limits,
    });
    expect(repo.row().currentPeriodEnd?.getTime()).toBe(NOW.getTime() + 30 * DAY);
  });

  it('creates the row when the user has none yet', async () => {
    const { repo, service } = setup();
    await service.handleWebhookEvent(rcEvent({ product_id: 'starter:monthly' }));
    expect(repo.row()).toMatchObject({ planKey: 'starter', paymentProvider: 'google_play' });
  });

  it('records the charge once per Google order id, in minor units', async () => {
    const { repo, service } = setup();
    repo.seed(USER_ID, {});
    const event = rcEvent({ type: 'RENEWAL', price_in_purchased_currency: 2.5, currency: 'eur' });
    await service.handleWebhookEvent(event);
    await service.handleWebhookEvent({ ...event, id: 'evt-redelivered-with-new-id' });
    expect(repo.payments).toHaveLength(1);
    expect(repo.payments[0]).toMatchObject({
      provider: 'google_play',
      transactionId: event.transaction_id,
      amount: 250,
      currency: 'EUR',
      description: 'Google Play: Pro (monthly)',
    });
  });
});

describe('webhook: idempotency and ordering', () => {
  it('applies an event id once; a redelivery is a duplicate', async () => {
    const { repo, service } = setup();
    repo.seed(USER_ID, {});
    const event = rcEvent();
    expect(await service.handleWebhookEvent(event)).toBe('applied');
    expect(await service.handleWebhookEvent(event)).toBe('duplicate');
    expect(repo.events.get(event.id)).toBe('applied');
    expect(repo.transactions).toBe(1);
  });

  it('forgets the event id when applying fails, so the retry runs', async () => {
    const { repo, service } = setup();
    repo.seed(USER_ID, {});
    const failing = jest.spyOn(repo, 'findPlanByKey').mockRejectedValueOnce(new Error('db down'));
    const event = rcEvent();
    await expect(service.handleWebhookEvent(event)).rejects.toThrow('db down');
    expect(repo.events.has(event.id)).toBe(false);
    failing.mockRestore();
    expect(await service.handleWebhookEvent(event)).toBe('applied');
  });

  it('skips an event older than the state already applied', async () => {
    const { repo, service } = setup();
    repo.seed(USER_ID, {});
    await service.handleWebhookEvent(
      rcEvent({
        type: 'CANCELLATION',
        cancel_reason: 'UNSUBSCRIBE',
        event_timestamp_ms: NOW.getTime(),
      }),
    );
    expect(
      await service.handleWebhookEvent(
        rcEvent({ type: 'RENEWAL', event_timestamp_ms: NOW.getTime() - 60_000 }),
      ),
    ).toBe('stale');
    expect(repo.row().cancelAtPeriodEnd).toBe(true);
  });
});

describe('webhook: cancellation, expiry, refunds, grace, pause', () => {
  const bought = async () => {
    const s = setup();
    s.repo.seed(USER_ID, {});
    await s.service.handleWebhookEvent(rcEvent({ event_timestamp_ms: NOW.getTime() - 10_000 }));
    return s;
  };

  it('CANCELLATION keeps the plan until it expires, renewal off', async () => {
    const { repo, service } = await bought();
    await service.handleWebhookEvent(
      rcEvent({ type: 'CANCELLATION', cancel_reason: 'UNSUBSCRIBE' }),
    );
    expect(repo.row()).toMatchObject({
      planKey: 'pro',
      status: 'active',
      paymentProvider: 'google_play',
      cancelAtPeriodEnd: true,
      storeState: 'cancelled',
    });
    expect(repo.row().cancelledAt).toEqual(NOW);
  });

  it('UNCANCELLATION turns renewal back on', async () => {
    const { repo, service } = await bought();
    await service.handleWebhookEvent(
      rcEvent({
        type: 'CANCELLATION',
        cancel_reason: 'UNSUBSCRIBE',
        event_timestamp_ms: NOW.getTime() - 5000,
      }),
    );
    await service.handleWebhookEvent(rcEvent({ type: 'UNCANCELLATION' }));
    expect(repo.row()).toMatchObject({
      cancelAtPeriodEnd: false,
      storeState: 'active',
      cancelledAt: null,
    });
  });

  it('EXPIRATION moves the user back to Free and keeps the store facts', async () => {
    const { repo, service } = await bought();
    await service.handleWebhookEvent(
      rcEvent({ type: 'EXPIRATION', expiration_at_ms: NOW.getTime() - 1000 }),
    );
    expect(repo.row()).toMatchObject({
      planId: PLANS.free.id,
      planKey: 'free',
      status: 'active',
      paymentProvider: null,
      merchantSubscriptionId: null,
      storeState: 'expired',
      storeOriginalTransactionId: 'GPA.1111-2222-3333-44444',
      limitsSnapshot: PLANS.free.limits,
    });
  });

  it('a refund (CANCELLATION, CUSTOMER_SUPPORT) ends access now and marks the charge refunded', async () => {
    const { repo, service } = await bought();
    const charge = repo.payments[0];
    await service.handleWebhookEvent(
      rcEvent({
        type: 'CANCELLATION',
        cancel_reason: 'CUSTOMER_SUPPORT',
        transaction_id: charge.transactionId,
      }),
    );
    expect(repo.row()).toMatchObject({
      planKey: 'free',
      storeState: 'refunded',
      paymentProvider: null,
    });
    expect(repo.payments[0].status).toBe('refunded');
  });

  it('BILLING_ISSUE keeps access in the grace period (past_due)', async () => {
    const { repo, service } = await bought();
    await service.handleWebhookEvent(
      rcEvent({
        type: 'BILLING_ISSUE',
        expiration_at_ms: NOW.getTime() - 1000,
        grace_period_expiration_at_ms: NOW.getTime() + 3 * DAY,
      }),
    );
    expect(repo.row()).toMatchObject({ planKey: 'pro', status: 'past_due', storeState: 'grace' });
  });

  it('SUBSCRIPTION_PAUSED keeps access until the period ends, renewal off', async () => {
    const { repo, service } = await bought();
    await service.handleWebhookEvent(rcEvent({ type: 'SUBSCRIPTION_PAUSED' }));
    expect(repo.row()).toMatchObject({
      planKey: 'pro',
      cancelAtPeriodEnd: true,
      storeState: 'paused',
    });
  });
});

describe('webhook: who and where', () => {
  it('answers unknown_user (200, no retry) for ids we do not know', async () => {
    const { repo, service } = setup();
    const outcome = await service.handleWebhookEvent(
      rcEvent({
        app_user_id: '$RCAnonymousID:abc',
        original_app_user_id: '$RCAnonymousID:abc',
        aliases: ['33333333-3333-4333-8333-333333333333'],
      }),
    );
    expect(outcome).toBe('unknown_user');
    expect(repo.rows.size).toBe(0);
  });

  it('finds our user through an alias', async () => {
    const { repo, service } = setup();
    repo.seed(USER_ID, {});
    await service.handleWebhookEvent(
      rcEvent({ app_user_id: '$RCAnonymousID:abc', aliases: ['$RCAnonymousID:abc', USER_ID] }),
    );
    expect(repo.row().paymentProvider).toBe('google_play');
  });

  it('ignores sandbox events unless accepted', async () => {
    const off = setup({ acceptSandbox: false });
    off.repo.seed(USER_ID, {});
    expect(await off.service.handleWebhookEvent(rcEvent({ environment: 'SANDBOX' }))).toBe(
      'ignored_sandbox',
    );
    expect(off.repo.row().paymentProvider).toBeNull();

    const on = setup({ acceptSandbox: true });
    on.repo.seed(USER_ID, {});
    expect(await on.service.handleWebhookEvent(rcEvent({ environment: 'SANDBOX' }))).toBe(
      'applied',
    );
    expect(on.repo.row().storeEnvironment).toBe('SANDBOX');
  });

  it('ignores TEST events and other stores with a reason', async () => {
    const { service } = setup();
    expect(await service.handleWebhookEvent(rcEvent({ type: 'TEST' }))).toBe('ignored:test_event');
    expect(await service.handleWebhookEvent(rcEvent({ store: 'APP_STORE' }))).toBe(
      'ignored:unsupported_store:APP_STORE',
    );
  });
});

describe('webhook: product change and transfer', () => {
  it('PRODUCT_CHANGE re-reads the subscriber when the API key is set', async () => {
    const { repo, service, getSubscriber } = setup({
      subscriber: {
        subscriptions: {
          business: {
            store: 'PLAY_STORE',
            product_plan_identifier: 'monthly',
            expires_date: new Date(NOW.getTime() + 20 * DAY).toISOString(),
          },
        },
      },
    });
    repo.seed(USER_ID, {});
    expect(
      await service.handleWebhookEvent(
        rcEvent({ type: 'PRODUCT_CHANGE', new_product_id: 'business:monthly' }),
      ),
    ).toBe('resynced');
    expect(getSubscriber).toHaveBeenCalledWith(USER_ID);
    expect(repo.row()).toMatchObject({ planKey: 'business', storeProductId: 'business:monthly' });
  });

  it('PRODUCT_CHANGE without an API key applies the new product', async () => {
    const { repo, service } = setup({ subscriber: null });
    repo.seed(USER_ID, {});
    await service.handleWebhookEvent(
      rcEvent({
        type: 'PRODUCT_CHANGE',
        product_id: 'starter:monthly',
        new_product_id: 'pro:yearly',
      }),
    );
    expect(repo.row()).toMatchObject({ planKey: 'pro', billingCycle: 'yearly' });
  });

  it('TRANSFER ends the plan on the old account and re-reads the new one', async () => {
    const future = new Date(NOW.getTime() + 20 * DAY).toISOString();
    const { repo, service } = setup({
      subscriber: {
        subscriptions: { 'pro:monthly': { store: 'PLAY_STORE', expires_date: future } },
      },
    });
    repo.seed(USER_ID, {
      planId: PLANS.pro.id,
      paymentProvider: 'google_play',
      storeState: 'active',
    });
    repo.seed(OTHER_USER_ID, {});
    expect(
      await service.handleWebhookEvent(
        rcEvent({ type: 'TRANSFER', transferred_from: [USER_ID], transferred_to: [OTHER_USER_ID] }),
      ),
    ).toBe('transferred');
    expect(repo.row(USER_ID)).toMatchObject({ planKey: 'free', paymentProvider: null });
    expect(repo.row(OTHER_USER_ID)).toMatchObject({
      planKey: 'pro',
      paymentProvider: 'google_play',
    });
  });
});

describe('one biller per user (conflict rule)', () => {
  it('a Play purchase while Paddle bills the plan is recorded, not applied', async () => {
    const { repo, service } = setup();
    repo.seed(USER_ID, {
      planId: PLANS.starter.id,
      paymentProvider: 'paddle',
      merchantSubscriptionId: 'sub_paddle',
    });
    expect(await service.handleWebhookEvent(rcEvent({ product_id: 'pro:monthly' }))).toBe(
      'conflict',
    );
    expect(repo.row()).toMatchObject({
      planKey: 'starter',
      paymentProvider: 'paddle',
      merchantSubscriptionId: 'sub_paddle',
      storeState: 'conflict',
      storeProductId: 'pro:monthly',
    });
  });

  it('sync answers 409 SUBSCRIPTION_MANAGED_BY_PADDLE in that case', async () => {
    const future = new Date(NOW.getTime() + 20 * DAY).toISOString();
    const { repo, service } = setup({
      subscriber: {
        subscriptions: { 'pro:monthly': { store: 'PLAY_STORE', expires_date: future } },
      },
    });
    repo.seed(USER_ID, { planId: PLANS.starter.id, paymentProvider: 'paddle' });
    await expect(service.syncOrConflict(USER_ID)).rejects.toMatchObject({
      statusCode: 409,
      code: 'SUBSCRIPTION_MANAGED_BY_PADDLE',
    });
    expect(repo.row().planKey).toBe('starter');
  });

  it('a cancelled Paddle plan no longer blocks the Play purchase', async () => {
    const { repo, service } = setup();
    repo.seed(USER_ID, {
      planId: PLANS.starter.id,
      paymentProvider: 'paddle',
      status: 'cancelled',
    });
    expect(await service.handleWebhookEvent(rcEvent())).toBe('applied');
    expect(repo.row()).toMatchObject({ planKey: 'pro', paymentProvider: 'google_play' });
  });

  it('an expiry of a Play purchase never touches a Paddle plan', async () => {
    const { repo, service } = setup();
    repo.seed(USER_ID, { planId: PLANS.pro.id, paymentProvider: 'paddle' });
    expect(
      await service.handleWebhookEvent(
        rcEvent({ type: 'EXPIRATION', expiration_at_ms: NOW.getTime() - 1 }),
      ),
    ).toBe('recorded');
    expect(repo.row()).toMatchObject({
      planKey: 'pro',
      paymentProvider: 'paddle',
      storeState: 'expired',
    });
  });
});

describe('sync', () => {
  it('applies the subscriber right after a purchase', async () => {
    const future = new Date(NOW.getTime() + 365 * DAY).toISOString();
    const { repo, service } = setup({
      subscriber: {
        management_url: 'https://play.google.com/store/account/subscriptions?sku=pro',
        subscriptions: {
          pro: { store: 'PLAY_STORE', product_plan_identifier: 'yearly', expires_date: future },
        },
      },
    });
    repo.seed(USER_ID, {});
    expect(await service.syncOrConflict(USER_ID)).toEqual({ outcome: 'applied', conflict: false });
    expect(repo.row()).toMatchObject({
      planKey: 'pro',
      billingCycle: 'yearly',
      storeManagementUrl: 'https://play.google.com/store/account/subscriptions?sku=pro',
    });
  });

  it('does nothing when the user has no store purchases', async () => {
    const { repo, service } = setup({ subscriber: { subscriptions: {} } });
    repo.seed(USER_ID, {});
    expect(await service.syncUser(USER_ID)).toEqual({ outcome: 'none', conflict: false });
    expect(repo.row().paymentProvider).toBeNull();
  });

  it('503 STORE_BILLING_UNAVAILABLE without an API key; 502 when RevenueCat fails', async () => {
    await expect(setup({ subscriber: null }).service.syncUser(USER_ID)).rejects.toMatchObject({
      statusCode: 503,
      code: 'STORE_BILLING_UNAVAILABLE',
    });
    const failing = setup({ subscriber: new Error('timeout') });
    const error = await failing.service.syncUser(USER_ID).catch((e) => e);
    expect(error).toBeInstanceOf(StoreBillingError);
    expect(error).toMatchObject({ statusCode: 502, code: 'STORE_SYNC_FAILED' });
  });
});
