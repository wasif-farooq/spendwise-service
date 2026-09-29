const configValues: Record<string, string | undefined> = {};

jest.mock('@config/ConfigLoader', () => ({
  ConfigLoader: {
    getInstance: () => ({
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      get: (key: string) => require('./paddleGateway.test').__configValues[key],
    }),
  },
}));

export const __configValues = configValues;

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { PaddleGateway, toMinorUnits } = require('@domains/payment/services/PaddleGateway');

type FetchCall = { url: string; init: RequestInit };

const API_KEY = 'pdl_sdbx_apikey_unit';
const CLIENT_TOKEN = 'test_clienttoken_unit';

const json = (status: number, body: unknown) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    statusText: 'x',
    text: async () => JSON.stringify(body),
  }) as unknown as Response;

let calls: FetchCall[];
let responses: Response[];

beforeEach(() => {
  Object.assign(configValues, {
    'paddle.apiKey': API_KEY,
    'paddle.clientToken': CLIENT_TOKEN,
    'paddle.environment': 'sandbox',
  });
  calls = [];
  responses = [];
  global.fetch = jest.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const next = responses.shift();
    if (!next) throw new Error(`unexpected fetch ${url}`);
    return next;
  }) as unknown as typeof fetch;
});

const checkoutParams = {
  planId: 'plan-pro',
  planPrice: 9.99,
  planName: 'Pro Monthly',
  billingPeriod: 'monthly' as const,
  customer: { email: 'Buyer@Example.com', name: 'Buy Er' },
  successUrl: 'http://x/success',
  cancelUrl: 'http://x/cancel',
  userId: 'user-1',
  currency: 'usd',
};

describe('PaddleGateway', () => {
  it('refuses to construct without an API key', () => {
    configValues['paddle.apiKey'] = undefined;
    expect(() => new PaddleGateway()).toThrow('PADDLE_API_KEY is not configured');
  });

  it('uses the sandbox host for PADDLE_ENV=sandbox and the live host otherwise', async () => {
    responses.push(json(200, { data: { id: 'sub_1', status: 'active', custom_data: null } }));
    await new PaddleGateway().getSubscriptionDetails('sub_1');
    expect(calls[0].url).toBe('https://sandbox-api.paddle.com/subscriptions/sub_1');

    configValues['paddle.environment'] = 'production';
    responses.push(json(200, { data: { id: 'sub_1', status: 'active', custom_data: null } }));
    await new PaddleGateway().getSubscriptionDetails('sub_1');
    expect(calls[1].url).toBe('https://api.paddle.com/subscriptions/sub_1');
  });

  it('reuses an existing customer and creates a non-catalog recurring transaction', async () => {
    responses.push(json(200, { data: [{ id: 'ctm_existing' }] }));
    responses.push(json(201, { data: { id: 'txn_01abc', status: 'draft' } }));

    const session = await new PaddleGateway().createCheckoutSession(checkoutParams);

    expect(calls).toHaveLength(2);
    expect(calls[0].url).toBe('https://sandbox-api.paddle.com/customers?email=buyer%40example.com');
    expect(calls[0].init.method).toBe('GET');
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe(
      `Bearer ${API_KEY}`,
    );

    expect(calls[1].url).toBe('https://sandbox-api.paddle.com/transactions');
    expect(calls[1].init.method).toBe('POST');
    const body = JSON.parse(calls[1].init.body as string);
    expect(body.customer_id).toBe('ctm_existing');
    expect(body.currency_code).toBe('USD');
    expect(body.custom_data).toEqual({
      userId: 'user-1',
      planId: 'plan-pro',
      billingPeriod: 'monthly',
      app: 'spendwise',
    });
    expect(body.items).toHaveLength(1);
    const price = body.items[0].price;
    expect(price.price_id).toBeUndefined();
    expect(price.unit_price).toEqual({ amount: '999', currency_code: 'USD' });
    expect(price.billing_cycle).toEqual({ interval: 'month', frequency: 1 });
    expect(price.quantity).toEqual({ minimum: 1, maximum: 1 });
    expect(price.product).toEqual({ name: 'TrackMyPocket Pro Monthly', tax_category: 'standard' });

    expect(session).toEqual({
      url: '',
      sessionId: 'txn_01abc',
      provider: 'paddle',
      transactionId: 'txn_01abc',
      clientToken: CLIENT_TOKEN,
      environment: 'sandbox',
    });
  });

  it.each([
    ['TrackMyPocket Pro Monthly', 'TrackMyPocket Pro Monthly'],
    ['SpendWise Pro Monthly', 'SpendWise Pro Monthly'],
  ])('keeps an already-branded plan name (%s) as-is', async (planName, expected) => {
    responses.push(json(200, { data: [{ id: 'ctm_existing' }] }));
    responses.push(json(201, { data: { id: 'txn_01abc', status: 'draft' } }));

    await new PaddleGateway().createCheckoutSession({ ...checkoutParams, planName });

    const price = JSON.parse(calls[1].init.body as string).items[0].price;
    expect(price.product.name).toBe(expected);
  });

  it('creates the customer when none exists and bills yearly plans per year', async () => {
    responses.push(json(200, { data: [] }));
    responses.push(json(201, { data: { id: 'ctm_new' } }));
    responses.push(json(201, { data: { id: 'txn_01year' } }));

    await new PaddleGateway().createCheckoutSession({
      ...checkoutParams,
      billingPeriod: 'yearly',
      planPrice: 99.99,
    });

    expect(calls[1].url).toBe('https://sandbox-api.paddle.com/customers');
    expect(JSON.parse(calls[1].init.body as string)).toEqual({
      email: 'buyer@example.com',
      name: 'Buy Er',
    });
    const price = JSON.parse(calls[2].init.body as string).items[0].price;
    expect(price.billing_cycle).toEqual({ interval: 'year', frequency: 1 });
    expect(price.unit_price.amount).toBe('9999');
    expect(JSON.parse(calls[2].init.body as string).customer_id).toBe('ctm_new');
  });

  it('falls back to the id named in a customer_already_exists conflict', async () => {
    responses.push(json(200, { data: [] }));
    responses.push(
      json(409, {
        error: {
          code: 'customer_already_exists',
          detail: 'customer email conflicts with customer of id ctm_01archived',
        },
      }),
    );
    responses.push(json(201, { data: { id: 'txn_01x' } }));
    await new PaddleGateway().createCheckoutSession(checkoutParams);
    expect(JSON.parse(calls[2].init.body as string).customer_id).toBe('ctm_01archived');
  });

  it('maps Paddle errors to AppErrors without leaking the key', async () => {
    responses.push(json(403, { error: { code: 'forbidden', detail: 'Invalid API key' } }));
    const err = await new PaddleGateway()
      .getTransaction('txn_01abc')
      .catch((e: Error & { statusCode: number }) => e);
    expect(err.statusCode).toBe(502);
    expect(err.message).toBe('Paddle API error (forbidden): Invalid API key');
    expect(err.message).not.toContain(API_KEY);

    responses.push(json(404, { error: { code: 'not_found', detail: 'nope' } }));
    const nf = await new PaddleGateway()
      .getTransaction('txn_01zzz')
      .catch((e: { statusCode: number }) => e);
    expect(nf.statusCode).toBe(404);
  });

  it('refuses a checkout when no client token is configured', async () => {
    configValues['paddle.clientToken'] = undefined;
    await expect(new PaddleGateway().createCheckoutSession(checkoutParams)).rejects.toMatchObject({
      statusCode: 503,
    });
    expect(calls).toHaveLength(0);
  });

  it('cancels at period end by default, or immediately', async () => {
    responses.push(json(200, { data: {} }), json(200, { data: {} }));
    const gw = new PaddleGateway();
    await gw.cancelSubscription('sub_1');
    await gw.cancelSubscription('sub_1', false);
    expect(calls[0].url).toBe('https://sandbox-api.paddle.com/subscriptions/sub_1/cancel');
    expect(JSON.parse(calls[0].init.body as string)).toEqual({
      effective_from: 'next_billing_period',
    });
    expect(JSON.parse(calls[1].init.body as string)).toEqual({ effective_from: 'immediately' });
  });

  it('maps subscription details', async () => {
    responses.push(
      json(200, {
        data: {
          id: 'sub_1',
          status: 'canceled',
          custom_data: { planId: 'plan-pro' },
          current_billing_period: {
            starts_at: '2026-01-01T00:00:00Z',
            ends_at: '2026-02-01T00:00:00Z',
          },
          scheduled_change: null,
        },
      }),
    );
    expect(await new PaddleGateway().getSubscriptionDetails('sub_1')).toEqual({
      id: 'sub_1',
      status: 'cancelled',
      planId: 'plan-pro',
      currentPeriodEnd: new Date('2026-02-01T00:00:00Z'),
      cancelAtPeriodEnd: false,
    });
  });

  it('converts prices to integer minor-unit strings', () => {
    expect(toMinorUnits(9.99)).toBe('999');
    expect(toMinorUnits(287.9)).toBe('28790');
    expect(() => toMinorUnits(0)).toThrow();
  });
});
