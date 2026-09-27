import crypto from 'crypto';
import { Request, Response } from 'express';
import { ConfigLoader } from '@config/ConfigLoader';
import { Container } from '@di/Container';
import { TOKENS } from '@di/tokens';
import { DatabaseFacade } from '@facades/DatabaseFacade';
import { PaddleGateway } from '../services/PaddleGateway';
import { PaddleBillingService, PaddleWebhookEvent } from '../services/PaddleBillingService';

/** Paddle rejects replays older than this in its own SDKs; we match it. */
export const PADDLE_SIGNATURE_TOLERANCE_SECONDS = 300;

export type PaddleSignatureResult =
  | { ok: true }
  | { ok: false; reason: 'missing_secret' | 'missing_header' | 'malformed' | 'stale' | 'mismatch' };

/**
 * Verifies a `Paddle-Signature` header (`ts=<unix>;h1=<hex>[;h1=<hex>]`).
 *
 * h1 is HMAC-SHA256(secret, `${ts}:${rawBody}`) in hex. More than one h1 can be present
 * while a secret is being rotated; any match is accepted. Comparison is constant-time.
 */
export function verifyPaddleSignature(
  rawBody: Buffer | string,
  header: string | undefined,
  secret: string | undefined,
  nowSeconds: number = Math.floor(Date.now() / 1000),
  toleranceSeconds: number = PADDLE_SIGNATURE_TOLERANCE_SECONDS,
): PaddleSignatureResult {
  if (!secret) return { ok: false, reason: 'missing_secret' };
  if (!header) return { ok: false, reason: 'missing_header' };

  let ts: string | undefined;
  const h1s: string[] = [];
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key === 'ts') ts = value;
    else if (key === 'h1' && value) h1s.push(value);
  }
  if (!ts || !/^\d+$/.test(ts) || h1s.length === 0) return { ok: false, reason: 'malformed' };

  if (Math.abs(nowSeconds - Number(ts)) > toleranceSeconds) return { ok: false, reason: 'stale' };

  const body = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody, 'utf8');
  const expected = crypto
    .createHmac('sha256', secret)
    .update(Buffer.concat([Buffer.from(`${ts}:`, 'utf8'), body]))
    .digest();

  const matched = h1s.some((h1) => {
    if (!/^[0-9a-f]+$/i.test(h1) || h1.length !== expected.length * 2) return false;
    return crypto.timingSafeEqual(Buffer.from(h1, 'hex'), expected);
  });
  return matched ? { ok: true } : { ok: false, reason: 'mismatch' };
}

export class PaddleWebhookHandler {
  constructor(
    private readonly getSecret: () => string | undefined = () =>
      ConfigLoader.getInstance().get('paddle.webhookSecret'),
    private readonly getService: () => PaddleBillingService = () =>
      new PaddleBillingService(
        new PaddleGateway(),
        Container.getInstance().resolve<DatabaseFacade>(TOKENS.Database),
      ),
  ) {}

  async handleWebhook(req: Request, res: Response): Promise<void> {
    const secret = this.getSecret();

    // This endpoint grants subscriptions. Without a secret nothing can be verified, so
    // refuse everything rather than trust the body.
    if (!secret) {
      console.error('[PaddleWebhook] PADDLE_WEBHOOK_SECRET is not configured — refusing webhook');
      res.status(500).send('Webhook secret not configured');
      return;
    }

    if (!Buffer.isBuffer(req.body)) {
      console.error(
        '[PaddleWebhook] Body was parsed before the handler. Mount express.raw() for ' +
          'PADDLE_WEBHOOK_PATHS ahead of express.json().',
      );
      res.status(500).send('Webhook misconfigured');
      return;
    }

    const header = req.headers['paddle-signature'];
    const verdict = verifyPaddleSignature(
      req.body,
      Array.isArray(header) ? header[0] : header,
      secret,
    );
    if (!verdict.ok) {
      console.warn(`[PaddleWebhook] Rejected webhook: ${verdict.reason}`);
      const status =
        verdict.reason === 'missing_header' || verdict.reason === 'malformed' ? 400 : 401;
      res.status(status).send('Invalid signature');
      return;
    }

    let event: PaddleWebhookEvent;
    try {
      event = JSON.parse(req.body.toString('utf8'));
    } catch {
      res.status(400).send('Invalid JSON');
      return;
    }

    try {
      const outcome = await this.getService().handleEvent(event);
      console.log(`[PaddleWebhook] ${event.event_type} (${event.event_id ?? 'no id'}): ${outcome}`);
      res.json({ received: true, outcome });
    } catch (error) {
      // 5xx so Paddle retries; the handlers are idempotent.
      console.error('[PaddleWebhook] Error handling event:', (error as Error).message);
      res.status(500).send('Webhook handler error');
    }
  }
}

let instance: PaddleWebhookHandler | null = null;

export function getPaddleWebhookHandler(): PaddleWebhookHandler {
  if (!instance) instance = new PaddleWebhookHandler();
  return instance;
}
