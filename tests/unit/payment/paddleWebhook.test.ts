import crypto from 'crypto';
import express from 'express';
import request from 'supertest';
import {
  PaddleWebhookHandler,
  verifyPaddleSignature,
} from '@domains/payment/webhooks/PaddleWebhookHandler';
import {
  PADDLE_WEBHOOK_PATHS,
  RAW_BODY_WEBHOOK_PATHS,
} from '@domains/payment/routes/payment.routes';

const SECRET = 'pdl_ntfset_unit_test_secret';

const sign = (body: string, ts: number, secret = SECRET) =>
  `ts=${ts};h1=${crypto.createHmac('sha256', secret).update(`${ts}:${body}`).digest('hex')}`;

const now = () => Math.floor(Date.now() / 1000);

const event = JSON.stringify({
  event_id: 'evt_01unit',
  event_type: 'transaction.completed',
  occurred_at: new Date().toISOString(),
  data: { id: 'txn_01unittest0001', status: 'completed', custom_data: { app: 'spendwise' } },
});

describe('verifyPaddleSignature', () => {
  const ts = 1_700_000_000;

  it('accepts a correctly signed body', () => {
    expect(verifyPaddleSignature(event, sign(event, ts), SECRET, ts)).toEqual({ ok: true });
  });

  it('accepts a Buffer body identical to the signed string', () => {
    expect(verifyPaddleSignature(Buffer.from(event), sign(event, ts), SECRET, ts + 10).ok).toBe(
      true,
    );
  });

  it('accepts when any of several h1 values matches (secret rotation)', () => {
    const good = sign(event, ts).split(';h1=')[1];
    const header = `ts=${ts};h1=${'0'.repeat(64)};h1=${good}`;
    expect(verifyPaddleSignature(event, header, SECRET, ts).ok).toBe(true);
  });

  it('rejects a tampered body', () => {
    const tampered = event.replace('completed', 'paid');
    expect(verifyPaddleSignature(tampered, sign(event, ts), SECRET, ts)).toEqual({
      ok: false,
      reason: 'mismatch',
    });
  });

  it('rejects a signature made with another secret', () => {
    expect(verifyPaddleSignature(event, sign(event, ts, 'other'), SECRET, ts).ok).toBe(false);
  });

  it('rejects a timestamp outside the 300s tolerance, in either direction', () => {
    expect(verifyPaddleSignature(event, sign(event, ts), SECRET, ts + 301)).toEqual({
      ok: false,
      reason: 'stale',
    });
    expect(verifyPaddleSignature(event, sign(event, ts), SECRET, ts - 301).ok).toBe(false);
    expect(verifyPaddleSignature(event, sign(event, ts), SECRET, ts + 300).ok).toBe(true);
  });

  it('refuses everything when the secret is not configured', () => {
    expect(verifyPaddleSignature(event, sign(event, ts), undefined, ts)).toEqual({
      ok: false,
      reason: 'missing_secret',
    });
    expect(verifyPaddleSignature(event, sign(event, ts, ''), '', ts).ok).toBe(false);
  });

  it('rejects missing and malformed headers', () => {
    expect(verifyPaddleSignature(event, undefined, SECRET, ts)).toEqual({
      ok: false,
      reason: 'missing_header',
    });
    expect(verifyPaddleSignature(event, 'h1=abc', SECRET, ts)).toEqual({
      ok: false,
      reason: 'malformed',
    });
    expect(verifyPaddleSignature(event, `ts=${ts};h1=nothex`, SECRET, ts).ok).toBe(false);
  });
});

describe('PaddleWebhookHandler over HTTP', () => {
  let secret: string | undefined;
  const handleEvent = jest.fn();

  /** Mirrors Server.configureMiddleware ordering. */
  const buildApp = () => {
    const app = express();
    app.use(RAW_BODY_WEBHOOK_PATHS, express.raw({ type: '*/*' }));
    app.use(express.json());
    const handler = new PaddleWebhookHandler(
      () => secret,
      () => ({ handleEvent }) as never,
    );
    app.post(PADDLE_WEBHOOK_PATHS[0], (req, res) => handler.handleWebhook(req, res));
    return app;
  };

  beforeEach(() => {
    secret = SECRET;
    handleEvent.mockReset().mockResolvedValue('applied');
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  const post = (body: string, header?: string) => {
    const r = request(buildApp())
      .post(PADDLE_WEBHOOK_PATHS[0])
      .set('Content-Type', 'application/json');
    if (header) r.set('Paddle-Signature', header);
    return r.send(body);
  };

  it('processes a correctly signed event', async () => {
    const res = await post(event, sign(event, now()));
    expect(res.status).toBe(200);
    expect(handleEvent).toHaveBeenCalledWith(
      expect.objectContaining({ event_type: 'transaction.completed' }),
    );
  });

  it('rejects a bad signature with 401 and never runs the handler', async () => {
    const res = await post(event, sign(event, now(), 'wrong'));
    expect(res.status).toBe(401);
    expect(handleEvent).not.toHaveBeenCalled();
  });

  it('rejects a stale signature with 401', async () => {
    const res = await post(event, sign(event, now() - 3600));
    expect(res.status).toBe(401);
    expect(handleEvent).not.toHaveBeenCalled();
  });

  it('rejects a missing signature header with 400', async () => {
    const res = await post(event);
    expect(res.status).toBe(400);
    expect(handleEvent).not.toHaveBeenCalled();
  });

  it('refuses all events when the secret is unset', async () => {
    secret = undefined;
    const res = await post(event, sign(event, now()));
    expect(res.status).toBe(500);
    expect(handleEvent).not.toHaveBeenCalled();
  });

  it('returns 5xx when the event handler fails, so Paddle retries', async () => {
    handleEvent.mockRejectedValue(new Error('db down'));
    const res = await post(event, sign(event, now()));
    expect(res.status).toBe(500);
  });
});
