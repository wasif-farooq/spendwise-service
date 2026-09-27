import express from 'express';
import request from 'supertest';
import Stripe from 'stripe';
import { STRIPE_WEBHOOK_PATHS } from '@domains/payment/routes/payment.routes';

const STRIPE_SECRET_KEY = 'sk_test_unit';
const WEBHOOK_SECRET = 'whsec_unit_test_secret';

/** Mutable so individual tests can drop the webhook secret. */
const configValues: Record<string, any> = {
  'stripe.secretKey': STRIPE_SECRET_KEY,
  'stripe.webhookSecret': WEBHOOK_SECRET,
};

jest.mock('@config/ConfigLoader', () => ({
  ConfigLoader: {
    getInstance: () => ({
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      get: (key: string) => require('./stripeWebhook.test').__configValues[key],
    }),
  },
}));

export const __configValues = configValues;

// Imported after the config mock is registered.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { StripeWebhookHandler } = require('@domains/payment/webhooks/StripeWebhookHandler');

const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: '2025-01-27.acacia' as any });

/**
 * An event type the handler does not act on, so these tests exercise
 * signature verification without reaching the database.
 */
const buildEvent = () =>
  JSON.stringify({
    id: 'evt_test_1',
    type: 'customer.subscription.trial_will_end',
    data: { object: { id: 'sub_test_1' } },
  });

const sign = (payload: string, secret = WEBHOOK_SECRET) =>
  stripe.webhooks.generateTestHeaderString({ payload, secret });

/** Mirrors Server.configureMiddleware ordering. */
const buildApp = () => {
  const app = express();
  app.use(STRIPE_WEBHOOK_PATHS, express.raw({ type: '*/*' }));
  app.use(express.json());

  const handler = new StripeWebhookHandler();
  app.post(STRIPE_WEBHOOK_PATHS, (req: any, res: any) => handler.handleWebhook(req, res));

  return app;
};

beforeEach(() => {
  configValues['stripe.webhookSecret'] = WEBHOOK_SECRET;
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

describe('Stripe webhook body parsing', () => {
  it('delivers the body as a raw Buffer despite the global JSON parser', async () => {
    const app = express();
    app.use(STRIPE_WEBHOOK_PATHS, express.raw({ type: '*/*' }));
    app.use(express.json());

    let sawBuffer: boolean | undefined;
    app.post(STRIPE_WEBHOOK_PATHS[0], (req, res) => {
      sawBuffer = Buffer.isBuffer(req.body);
      res.json({ ok: true });
    });

    await request(app)
      .post(STRIPE_WEBHOOK_PATHS[0])
      .set('Content-Type', 'application/json')
      .send(buildEvent());

    expect(sawBuffer).toBe(true);
  });

  it('still parses JSON normally on other routes', async () => {
    const app = express();
    app.use(STRIPE_WEBHOOK_PATHS, express.raw({ type: '*/*' }));
    app.use(express.json());

    let received: any;
    app.post('/api/v1/payment/checkout', (req, res) => {
      received = req.body;
      res.json({ ok: true });
    });

    await request(app).post('/api/v1/payment/checkout').send({ planId: 'plan_1' });

    expect(received).toEqual({ planId: 'plan_1' });
    expect(Buffer.isBuffer(received)).toBe(false);
  });

  it('covers both the current and legacy webhook paths', () => {
    expect(STRIPE_WEBHOOK_PATHS).toContain('/api/v1/payment/webhook/stripe');
    expect(STRIPE_WEBHOOK_PATHS).toContain('/api/v1/payment/webhooks/stripe');
  });
});

describe('Stripe webhook signature verification', () => {
  it('accepts a correctly signed event', async () => {
    const payload = buildEvent();

    const res = await request(buildApp())
      .post(STRIPE_WEBHOOK_PATHS[0])
      .set('Content-Type', 'application/json')
      .set('stripe-signature', sign(payload))
      .send(payload);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('rejects a payload tampered with after signing', async () => {
    const payload = buildEvent();
    const signature = sign(payload);
    const tampered = JSON.stringify({ ...JSON.parse(payload), type: 'checkout.session.completed' });

    const res = await request(buildApp())
      .post(STRIPE_WEBHOOK_PATHS[0])
      .set('Content-Type', 'application/json')
      .set('stripe-signature', signature)
      .send(tampered);

    expect(res.status).toBe(400);
  });

  it('rejects an event signed with the wrong secret', async () => {
    const payload = buildEvent();

    const res = await request(buildApp())
      .post(STRIPE_WEBHOOK_PATHS[0])
      .set('Content-Type', 'application/json')
      .set('stripe-signature', sign(payload, 'whsec_attacker_secret'))
      .send(payload);

    expect(res.status).toBe(400);
  });

  it('rejects a request with no signature header', async () => {
    const payload = buildEvent();

    const res = await request(buildApp())
      .post(STRIPE_WEBHOOK_PATHS[0])
      .set('Content-Type', 'application/json')
      .send(payload);

    expect(res.status).toBe(400);
    expect(res.text).toMatch(/signature/i);
  });

  it('refuses to process anything when no webhook secret is configured', async () => {
    configValues['stripe.webhookSecret'] = undefined;
    const payload = buildEvent();

    const res = await request(buildApp())
      .post(STRIPE_WEBHOOK_PATHS[0])
      .set('Content-Type', 'application/json')
      .set('stripe-signature', sign(payload))
      .send(payload);

    // Previously this branch trusted the body outright.
    expect(res.status).toBe(500);
    expect(res.body).not.toEqual({ received: true });
  });

  it('fails loudly if the body was parsed before reaching the handler', async () => {
    // Simulates the regression: JSON parser ahead of the webhook route.
    const app = express();
    app.use(express.json());

    const handler = new StripeWebhookHandler();
    app.post(STRIPE_WEBHOOK_PATHS[0], (req: any, res: any) => handler.handleWebhook(req, res));

    const payload = buildEvent();
    const res = await request(app)
      .post(STRIPE_WEBHOOK_PATHS[0])
      .set('Content-Type', 'application/json')
      .set('stripe-signature', sign(payload))
      .send(payload);

    expect(res.status).toBe(500);
    expect(res.text).toMatch(/misconfigured/i);
  });
});
