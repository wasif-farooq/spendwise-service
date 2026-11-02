import { RevenueCatSubscriber } from './storeState';

export interface RevenueCatClientOptions {
  /** Secret (sk_…) API key. Never the public SDK key. */
  secretApiKey: string;
  apiUrl?: string;
  timeoutMs?: number;
  fetchFn?: typeof fetch;
}

export class RevenueCatError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
  }
}

/**
 * The one RevenueCat REST call the API makes: GET /v1/subscribers/{app_user_id}.
 *
 * The key only goes into the Authorization header; errors carry the HTTP status and
 * RevenueCat's message, never headers.
 */
export class RevenueCatClient {
  private readonly apiUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchFn: typeof fetch;

  constructor(private readonly options: RevenueCatClientOptions) {
    this.apiUrl = (options.apiUrl || 'https://api.revenuecat.com').replace(/\/+$/, '');
    this.timeoutMs = options.timeoutMs ?? 10000;
    this.fetchFn = options.fetchFn ?? fetch;
  }

  async getSubscriber(appUserId: string): Promise<RevenueCatSubscriber> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;
    try {
      response = await this.fetchFn(
        `${this.apiUrl}/v1/subscribers/${encodeURIComponent(appUserId)}`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${this.options.secretApiKey}`,
            Accept: 'application/json',
          },
          signal: controller.signal,
        },
      );
    } catch (err) {
      const aborted = (err as Error)?.name === 'AbortError';
      throw new RevenueCatError(
        aborted ? 'RevenueCat did not answer in time' : 'RevenueCat is unreachable',
      );
    } finally {
      clearTimeout(timer);
    }

    const text = await response.text();
    let body: any = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = null;
    }
    if (!response.ok) {
      const detail = typeof body?.message === 'string' ? `: ${body.message}` : '';
      throw new RevenueCatError(`RevenueCat answered ${response.status}${detail}`, response.status);
    }
    if (!body?.subscriber || typeof body.subscriber !== 'object') {
      throw new RevenueCatError('RevenueCat sent an unexpected subscriber response');
    }
    return body.subscriber as RevenueCatSubscriber;
  }
}
