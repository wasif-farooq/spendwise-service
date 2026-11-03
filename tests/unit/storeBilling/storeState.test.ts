import {
  STORE_PRODUCTS,
  planKeyOfName,
  resolveStoreProduct,
} from '@domains/store-billing/storeProducts';
import {
  candidateUserIds,
  hasAccess,
  planForEvent,
  stateFromSubscriber,
} from '@domains/store-billing/storeState';
import { billingFieldsOf, subscriptionSourceOf } from '@domains/store-billing/subscriptionSource';
import { DAY, NOW, USER_ID, rcEvent } from './fakes';

describe('store products (one place: storeProducts.ts)', () => {
  it('maps every paid plan with a monthly and a yearly base plan', () => {
    expect(Object.keys(STORE_PRODUCTS).sort()).toEqual([
      'business:monthly',
      'business:yearly',
      'pro:monthly',
      'pro:yearly',
      'starter:monthly',
      'starter:yearly',
    ]);
  });

  it('resolves RevenueCat ids in both shapes', () => {
    expect(resolveStoreProduct('pro:yearly')).toEqual({ plan: 'pro', period: 'yearly' });
    expect(resolveStoreProduct('starter', 'monthly')).toEqual({
      plan: 'starter',
      period: 'monthly',
    });
    expect(resolveStoreProduct('pro:weekly')).toBeNull();
    expect(resolveStoreProduct('free:monthly')).toBeNull();
    expect(resolveStoreProduct(undefined)).toBeNull();
  });

  it('reads the plan key out of catalogue names', () => {
    expect(planKeyOfName('Pro Monthly')).toBe('pro');
    expect(planKeyOfName('Starter Monthly')).toBe('starter');
    expect(planKeyOfName('Free')).toBe('free');
    expect(planKeyOfName(null)).toBe('free');
  });
});

describe('planForEvent', () => {
  const applied = (over: Parameters<typeof rcEvent>[0]) => {
    const plan = planForEvent(rcEvent(over), NOW);
    if (plan.kind !== 'apply') throw new Error(`expected apply, got ${plan.kind}`);
    return plan;
  };

  it('INITIAL_PURCHASE: active and renewing, with the store ids and expiry', () => {
    const { state } = applied({ type: 'INITIAL_PURCHASE', product_id: 'pro:yearly' });
    expect(state).toMatchObject({
      provider: 'google_play',
      plan: 'pro',
      period: 'yearly',
      productId: 'pro:yearly',
      state: 'active',
      willRenew: true,
      originalTransactionId: 'GPA.1111-2222-3333-44444',
      environment: 'PRODUCTION',
    });
    expect(state.expiresAt?.getTime()).toBe(NOW.getTime() + 30 * DAY);
  });

  it.each(['RENEWAL', 'UNCANCELLATION', 'SUBSCRIPTION_EXTENDED'])('%s: active', (type) => {
    expect(applied({ type }).state).toMatchObject({ state: 'active', willRenew: true });
  });

  it('CANCELLATION (user turned renewal off): keeps access until the expiry', () => {
    const { state } = applied({ type: 'CANCELLATION', cancel_reason: 'UNSUBSCRIBE' });
    expect(state).toMatchObject({ state: 'cancelled', willRenew: false });
    expect(hasAccess(state, NOW)).toBe(true);
    expect(hasAccess(state, new Date(NOW.getTime() + 31 * DAY))).toBe(false);
  });

  it('CANCELLATION with BILLING_ERROR: still until the expiry', () => {
    expect(applied({ type: 'CANCELLATION', cancel_reason: 'BILLING_ERROR' }).state.state).toBe(
      'cancelled',
    );
  });

  it('CANCELLATION with CUSTOMER_SUPPORT is a refund: access ends now', () => {
    const plan = applied({ type: 'CANCELLATION', cancel_reason: 'CUSTOMER_SUPPORT' });
    expect(plan.state.state).toBe('refunded');
    expect(plan.refundedTransactionId).toMatch(/^GPA\./);
    expect(hasAccess(plan.state, NOW)).toBe(false);
  });

  it('EXPIRATION: no access', () => {
    const { state } = applied({ type: 'EXPIRATION', expiration_at_ms: NOW.getTime() - 1000 });
    expect(state.state).toBe('expired');
    expect(hasAccess(state, NOW)).toBe(false);
  });

  it('BILLING_ISSUE: grace period with access until it ends', () => {
    const graceEnd = NOW.getTime() + 3 * DAY;
    const { state } = applied({
      type: 'BILLING_ISSUE',
      expiration_at_ms: NOW.getTime() - 1000,
      grace_period_expiration_at_ms: graceEnd,
    });
    expect(state).toMatchObject({ state: 'grace', willRenew: true });
    expect(state.expiresAt?.getTime()).toBe(graceEnd);
    expect(hasAccess(state, NOW)).toBe(true);
  });

  it('SUBSCRIPTION_PAUSED: access until the paid period ends, no renewal', () => {
    const { state } = applied({ type: 'SUBSCRIPTION_PAUSED' });
    expect(state).toMatchObject({ state: 'paused', willRenew: false });
    expect(hasAccess(state, NOW)).toBe(true);
  });

  it('PRODUCT_CHANGE and REFUND_REVERSED re-read the subscriber', () => {
    expect(planForEvent(rcEvent({ type: 'PRODUCT_CHANGE' }), NOW).kind).toBe('resync');
    expect(planForEvent(rcEvent({ type: 'REFUND_REVERSED' }), NOW).kind).toBe('resync');
  });

  it('TRANSFER lists our user ids on each side', () => {
    expect(
      planForEvent(
        rcEvent({
          type: 'TRANSFER',
          transferred_from: [USER_ID, '$RCAnonymousID:abc'],
          transferred_to: ['not-a-uuid'],
        }),
        NOW,
      ),
    ).toEqual({ kind: 'transfer', from: [USER_ID], to: [] });
  });

  it('ignores test events, other types, other stores and unknown products', () => {
    expect(planForEvent(rcEvent({ type: 'TEST' }), NOW)).toEqual({
      kind: 'ignore',
      reason: 'test_event',
    });
    expect(planForEvent(rcEvent({ type: 'NON_RENEWING_PURCHASE' }), NOW).kind).toBe('ignore');
    expect(planForEvent(rcEvent({ store: 'APP_STORE' }), NOW)).toEqual({
      kind: 'ignore',
      reason: 'unsupported_store:APP_STORE',
    });
    expect(planForEvent(rcEvent({ product_id: 'mystery' }), NOW)).toEqual({
      kind: 'ignore',
      reason: 'unknown_product:mystery',
    });
  });

  it('marks sandbox purchases', () => {
    expect(applied({ environment: 'SANDBOX' }).state.environment).toBe('SANDBOX');
  });
});

describe('candidateUserIds', () => {
  it('keeps only uuids, from the app user id, original id and aliases', () => {
    expect(
      candidateUserIds(
        rcEvent({
          app_user_id: '$RCAnonymousID:123',
          original_app_user_id: '$RCAnonymousID:123',
          aliases: ['$RCAnonymousID:123', USER_ID.toUpperCase()],
        }),
      ),
    ).toEqual([USER_ID]);
  });
});

describe('stateFromSubscriber (GET /v1/subscribers)', () => {
  const iso = (offsetDays: number) => new Date(NOW.getTime() + offsetDays * DAY).toISOString();

  it('picks the active Play subscription and its management URL', () => {
    const state = stateFromSubscriber(
      {
        management_url: 'https://play.google.com/store/account/subscriptions',
        subscriptions: {
          pro: {
            store: 'PLAY_STORE',
            expires_date: iso(10),
            product_plan_identifier: 'yearly',
            is_sandbox: false,
          },
        },
      },
      { acceptSandbox: false, now: NOW },
    );
    expect(state).toMatchObject({
      plan: 'pro',
      period: 'yearly',
      productId: 'pro:yearly',
      state: 'active',
      managementUrl: 'https://play.google.com/store/account/subscriptions',
    });
  });

  it('prefers access, then the higher plan', () => {
    const state = stateFromSubscriber(
      {
        subscriptions: {
          'business:monthly': { store: 'PLAY_STORE', expires_date: iso(-1) },
          'starter:monthly': { store: 'PLAY_STORE', expires_date: iso(5) },
          'pro:monthly': { store: 'PLAY_STORE', expires_date: iso(5) },
        },
      },
      { acceptSandbox: false, now: NOW },
    );
    expect(state?.plan).toBe('pro');
  });

  it('reads cancelled, grace, paused, refunded and expired', () => {
    const one = (sub: object) =>
      stateFromSubscriber(
        { subscriptions: { 'pro:monthly': { store: 'PLAY_STORE', expires_date: iso(5), ...sub } } },
        { acceptSandbox: false, now: NOW },
      )?.state;
    expect(one({ unsubscribe_detected_at: iso(-1) })).toBe('cancelled');
    expect(
      one({
        expires_date: iso(-1),
        billing_issues_detected_at: iso(-1),
        grace_period_expires_date: iso(2),
      }),
    ).toBe('grace');
    expect(one({ auto_resume_date: iso(40) })).toBe('paused');
    expect(one({ refunded_at: iso(-1) })).toBe('refunded');
    expect(one({ expires_date: iso(-1) })).toBe('expired');
  });

  it('skips sandbox purchases unless accepted, and other stores', () => {
    const subscriber = {
      subscriptions: {
        'pro:monthly': { store: 'PLAY_STORE', expires_date: iso(5), is_sandbox: true },
        'starter:monthly': { store: 'APP_STORE', expires_date: iso(5) },
      },
    };
    expect(stateFromSubscriber(subscriber, { acceptSandbox: false, now: NOW })).toBeNull();
    expect(stateFromSubscriber(subscriber, { acceptSandbox: true, now: NOW })?.environment).toBe(
      'SANDBOX',
    );
  });
});

describe('subscription source and billing fields', () => {
  it('names the biller of a live paid plan only', () => {
    expect(
      subscriptionSourceOf({
        status: 'active',
        paymentProvider: 'google_play',
        planKey: 'Pro Monthly',
      }),
    ).toBe('google_play');
    expect(
      subscriptionSourceOf({ status: 'past_due', paymentProvider: 'paddle', planKey: 'starter' }),
    ).toBe('paddle');
    expect(
      subscriptionSourceOf({ status: 'cancelled', paymentProvider: 'paddle', planKey: 'pro' }),
    ).toBeNull();
    expect(
      subscriptionSourceOf({ status: 'active', paymentProvider: 'google_play', planKey: 'Free' }),
    ).toBeNull();
    expect(subscriptionSourceOf(null)).toBeNull();
  });

  it('adds source, management URL, renewal and expiry for GET /subscription/current', () => {
    expect(
      billingFieldsOf({
        status: 'active',
        paymentProvider: 'google_play',
        planKey: 'pro',
        cancelAtPeriodEnd: true,
        currentPeriodEnd: new Date('2026-11-19T00:00:00Z'),
        billingCycle: 'yearly',
        storeManagementUrl: null,
      }),
    ).toEqual({
      source: 'google_play',
      managementUrl: 'https://play.google.com/store/account/subscriptions',
      willRenew: false,
      expiresAt: '2026-11-19T00:00:00.000Z',
      billingPeriod: 'yearly',
    });
    expect(
      billingFieldsOf({ status: 'active', paymentProvider: 'paddle', planKey: 'pro' })
        .managementUrl,
    ).toBeNull();
    expect(billingFieldsOf(null)).toEqual({
      source: null,
      managementUrl: null,
      willRenew: null,
      expiresAt: null,
      billingPeriod: null,
    });
  });
});
