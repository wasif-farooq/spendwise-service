import crypto from 'crypto';
import { Request, Response } from 'express';
import { RevenueCatEvent } from './storeState';
import { StoreSubscriptionService } from './StoreSubscriptionService';

/**
 * Constant-time check of the webhook's Authorization header against
 * REVENUECAT_WEBHOOK_AUTH. Both sides are hashed first so their lengths can't leak.
 */
export function webhookAuthorized(
  header: string | undefined,
  expected: string | undefined,
): boolean {
  if (!expected || !header) return false;
  const a = crypto.createHash('sha256').update(header, 'utf8').digest();
  const b = crypto.createHash('sha256').update(expected, 'utf8').digest();
  return crypto.timingSafeEqual(a, b);
}

/**
 * POST /api/v1/webhooks/revenuecat
 *
 * RevenueCat retries anything but a 2xx, so: 401 for a bad secret, 400 for a body that
 * isn't an event, 500 only for our own failures (it's safe to retry: events are applied
 * once by id), and 200 for everything else, including users we don't know.
 */
export class RevenueCatWebhookHandler {
  constructor(
    private readonly getExpectedAuth: () => string | undefined,
    private readonly getService: () => StoreSubscriptionService,
    private readonly logger: Pick<Console, 'info' | 'warn' | 'error'> = console,
  ) {}

  async handle(req: Request, res: Response): Promise<void> {
    const expected = this.getExpectedAuth();
    if (!expected) {
      // This endpoint grants plans: without a secret nothing can be trusted.
      this.logger.error('[RevenueCat] REVENUECAT_WEBHOOK_AUTH is not configured; refusing webhook');
      res.status(500).json({ message: 'Webhook not configured' });
      return;
    }

    const header = req.headers.authorization;
    if (!webhookAuthorized(Array.isArray(header) ? header[0] : header, expected)) {
      this.logger.warn('[RevenueCat] Rejected webhook: bad Authorization header');
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }

    const event = (req.body as { event?: RevenueCatEvent } | undefined)?.event;
    if (!event || typeof event.id !== 'string' || !event.id || typeof event.type !== 'string') {
      res.status(400).json({ message: 'Expected a RevenueCat event' });
      return;
    }

    try {
      const outcome = await this.getService().handleWebhookEvent(event);
      this.logger.info(`[RevenueCat] ${event.type} ${event.id}: ${outcome}`);
      res.status(200).json({ received: true, outcome });
    } catch (error) {
      this.logger.error(
        `[RevenueCat] ${event.type} ${event.id} failed: ${(error as Error).message}`,
      );
      res.status(500).json({ message: 'Webhook handler error' });
    }
  }
}
