import { ProviderDownError, ProviderError, RateLimitedError } from './errors';

/**
 * The one HTTP client every provider uses:
 *   - a timeout per request and an explicit User-Agent (Cloudflare-fronted
 *     explorers reject the default fetch agent)
 *   - 429 and 5xx (and network errors) retried up to 3 times with growing waits,
 *     honouring a short Retry-After; so is a 200 whose body the provider uses to
 *     say "rate limited" (isRateLimitedBody), as Etherscan does
 *   - an in-process request-rate cap per provider (requests are spaced out)
 *   - typed errors: RateLimited, ProviderDown; adapters raise InvalidAddress
 *     and AuthRevoked from the bodies they understand
 * Request URLs are never logged: they carry wallet addresses and API keys.
 */

export const CONNECTIONS_USER_AGENT = 'TrackMyPocket/1.0 (+https://trackmypocket.com)';

export type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body?: string; signal?: AbortSignal },
) => Promise<{
  ok: boolean;
  status: number;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
}>;

export interface HttpClientOptions {
  name: string;
  timeoutMs?: number;
  /** Requests per second this provider allows (spaced evenly). */
  maxPerSecond?: number;
  /** A 200 whose body means "rate limited" (retried like a 429). */
  isRateLimitedBody?: (body: any) => boolean;
  retries?: number;
  headers?: Record<string, string>;
  fetchImpl?: FetchLike;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export class HttpClient {
  private readonly timeoutMs: number;
  private readonly minGapMs: number;
  private readonly retries: number;
  private readonly fetchImpl: FetchLike;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;
  private nextSlot = 0;

  constructor(private readonly options: HttpClientOptions) {
    this.timeoutMs = options.timeoutMs ?? 15000;
    this.minGapMs = options.maxPerSecond ? Math.ceil(1000 / options.maxPerSecond) : 0;
    this.retries = options.retries ?? 3;
    this.fetchImpl = options.fetchImpl ?? (globalThis.fetch as unknown as FetchLike);
    this.sleep = options.sleep ?? defaultSleep;
    this.now = options.now ?? Date.now;
  }

  get name(): string {
    return this.options.name;
  }

  getJson<T = any>(url: string, headers: Record<string, string> = {}): Promise<T> {
    return this.request<T>('GET', url, undefined, headers);
  }

  postJson<T = any>(url: string, body: unknown, headers: Record<string, string> = {}): Promise<T> {
    return this.request<T>('POST', url, JSON.stringify(body), {
      'Content-Type': 'application/json',
      ...headers,
    });
  }

  /** Waits for this provider's next free slot (the rate cap). */
  private async throttle(): Promise<void> {
    if (!this.minGapMs) return;
    const now = this.now();
    const slot = Math.max(now, this.nextSlot);
    this.nextSlot = slot + this.minGapMs;
    if (slot > now) await this.sleep(slot - now);
  }

  private async request<T>(
    method: string,
    url: string,
    body: string | undefined,
    headers: Record<string, string>,
  ): Promise<T> {
    let lastError: ProviderError | null = null;
    for (let attempt = 0; attempt <= this.retries; attempt++) {
      if (attempt > 0) await this.sleep(this.backoffMs(attempt, lastError));
      await this.throttle();

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const response = await this.fetchImpl(url, {
          method,
          headers: {
            Accept: 'application/json',
            'User-Agent': CONNECTIONS_USER_AGENT,
            ...this.options.headers,
            ...headers,
          },
          body,
          signal: controller.signal,
        });
        const text = await response.text();
        if (response.status === 429) {
          lastError = new RateLimitedError(`${this.name} rate limited the request`, 429);
          (lastError as any).retryAfter = response.headers.get('retry-after');
          continue;
        }
        if (response.status >= 500) {
          lastError = new ProviderDownError(
            `${this.name} answered ${response.status}`,
            response.status,
          );
          continue;
        }
        if (!response.ok) {
          // 4xx other than 429: the adapter decides (bad address, bad key...).
          throw new HttpStatusError(this.name, response.status, text);
        }
        let parsed: T;
        try {
          parsed = (text ? JSON.parse(text) : null) as T;
        } catch {
          throw new ProviderDownError(`${this.name} answered with something that isn't JSON`);
        }
        if (this.options.isRateLimitedBody?.(parsed)) {
          lastError = new RateLimitedError(`${this.name} rate limited the request`, 429);
          continue;
        }
        return parsed;
      } catch (error) {
        // Answers we understood (a 4xx, a body that isn't JSON) aren't retried.
        if (error instanceof HttpStatusError || error instanceof ProviderError) throw error;
        const aborted = (error as Error)?.name === 'AbortError';
        lastError = new ProviderDownError(
          aborted ? `${this.name} timed out` : `${this.name} could not be reached`,
        );
      } finally {
        clearTimeout(timer);
      }
    }
    throw lastError ?? new ProviderDownError(`${this.name} could not be reached`);
  }

  private backoffMs(attempt: number, error: ProviderError | null): number {
    const retryAfter = Number((error as any)?.retryAfter);
    if (Number.isFinite(retryAfter) && retryAfter > 0) return Math.min(retryAfter * 1000, 5000);
    return 500 * 2 ** (attempt - 1);
  }
}

/** A 4xx answer (not 429), with the body for the adapter to interpret. */
export class HttpStatusError extends Error {
  constructor(
    readonly provider: string,
    readonly status: number,
    readonly body: string,
  ) {
    super(`${provider} answered ${status}`);
    this.name = 'HttpStatusError';
  }
}
