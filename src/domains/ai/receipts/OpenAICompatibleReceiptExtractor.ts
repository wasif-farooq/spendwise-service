import { ZodError } from 'zod';
import { parseReceiptReply } from './receiptSchema';
import { RECEIPT_SYSTEM_PROMPT, buildReceiptUserText } from './receiptPrompt';
import {
  ReceiptExtractInput,
  ReceiptExtractResult,
  ReceiptExtractor,
  ReceiptExtractUsage,
  receiptScanError,
} from './types';

export interface OpenAICompatibleOptions {
  provider: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  /** Budget for the whole extraction, including the retry (default 45 s). */
  timeoutMs?: number;
  /** Completion budget; reasoning models spend part of it thinking (default 6000). */
  maxTokens?: number;
  /** Sent with every call, e.g. OpenRouter's HTTP-Referer / X-Title attribution. */
  extraHeaders?: Record<string, string>;
  /** Pause before retrying a transient provider failure (default 1.5 s). */
  retryDelayMs?: number;
  fetchFn?: typeof fetch;
  now?: () => number;
}

type ChatReply = {
  choices?: Array<{ message?: { content?: unknown } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  /** OpenRouter reports upstream failures as HTTP 200 with an error and no choices. */
  error?: { code?: unknown; message?: unknown; type?: unknown };
};

/** Rate limits and provider/upstream failures are worth one more try; refusals are not. */
const isTransient = (status: number) => status === 429 || status >= 500;

/** A retry needs this much of the budget left to be worth making. */
const MIN_RETRY_BUDGET_MS = 10_000;

/** Something the provider said that means "try again without JSON mode". */
const rejectsJsonMode = (status: number, body: string) =>
  status === 400 && /response_format|json_object|json mode/i.test(body);

export const RECEIPT_SCAN_USER_AGENT = 'TrackMyPocket-API/1.0 (receipt-scan)';

/**
 * Why the provider refused, for the log (the client always gets 503 AI_UNAVAILABLE):
 * the free tier refusing server use, an empty balance, bad or disabled credentials,
 * rate limiting, or the provider failing.
 */
export const unavailableReason = (status: number, type: string | null, body: string): string => {
  if (type === 'FreeTierError') return 'free_tier_refused';
  if (status === 402 || /insufficient (account )?(funds|balance|credits)/i.test(body)) {
    return 'insufficient_funds';
  }
  if (status === 401) return 'bad_api_key';
  if (status === 403) return /access is disabled/i.test(body) ? 'model_disabled' : 'forbidden';
  if (status === 404) return 'model_not_found';
  if (status === 429) return 'rate_limited';
  if (status >= 500) return 'provider_error';
  return 'rejected';
};

/** `error.type` / `error.code` from an error body, if it is a bare identifier (e.g. FreeTierError). */
export const errorTypeOf = (body: string): string | null => {
  try {
    const parsed = JSON.parse(body);
    const value = parsed?.error?.type ?? parsed?.error?.code ?? parsed?.type;
    return typeof value === 'string' && /^[A-Za-z_]{1,40}$/.test(value) ? value : null;
  } catch {
    return null;
  }
};

const contentOf = (reply: ChatReply): string => {
  const content = reply.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => (typeof part === 'string' ? part : ((part as { text?: string })?.text ?? '')))
      .join('');
  }
  return '';
};

/**
 * Receipt extraction through any OpenAI-compatible chat-completions endpoint
 * (OpenCode Zen first). The image goes inline as a data URI; nothing is stored
 * and neither the image nor the reply text is logged.
 *
 * JSON: asks for `response_format: json_object`; if the provider rejects that
 * parameter, it falls back to the prompt's JSON-only instruction for the rest
 * of the process. Either way the reply is validated with zod, retrying once.
 */
export class OpenAICompatibleReceiptExtractor implements ReceiptExtractor {
  readonly provider: string;
  readonly model: string;
  private jsonMode = true;
  private readonly fetchFn: typeof fetch;
  private readonly now: () => number;
  private readonly timeoutMs: number;

  constructor(private readonly options: OpenAICompatibleOptions) {
    this.provider = options.provider;
    this.model = options.model;
    this.fetchFn = options.fetchFn ?? ((...args) => fetch(...args));
    this.now = options.now ?? Date.now;
    this.timeoutMs = options.timeoutMs && options.timeoutMs > 0 ? options.timeoutMs : 45_000;
  }

  /** Whether the provider accepted `response_format: json_object` (true until it refuses). */
  get usesJsonMode(): boolean {
    return this.jsonMode;
  }

  async extract(input: ReceiptExtractInput): Promise<ReceiptExtractResult> {
    const deadline = this.now() + this.timeoutMs;
    const usage: ReceiptExtractUsage = { inputTokens: null, outputTokens: null };
    let lastError: unknown;

    for (let attempt = 0; attempt < 2; attempt++) {
      const reply = await this.call(input, deadline, usage);
      try {
        return {
          receipt: parseReceiptReply(contentOf(reply)),
          usage,
          provider: this.provider,
          model: this.model,
        };
      } catch (error) {
        // Invalid JSON or wrong shape: one more try while there's time for it.
        lastError = error;
        if (deadline - this.now() < MIN_RETRY_BUDGET_MS) break;
      }
    }

    const reason = lastError instanceof ZodError ? 'schema mismatch' : 'invalid JSON';
    console.warn(`[ReceiptScan] ${this.provider}/${this.model} returned ${reason} twice`);
    throw receiptScanError('UNREADABLE', 422, usage);
  }

  private body(input: ReceiptExtractInput) {
    const dataUri = `data:${input.mimeType};base64,${input.image.toString('base64')}`;
    return {
      model: this.model,
      temperature: 0,
      max_tokens:
        this.options.maxTokens && this.options.maxTokens > 0 ? this.options.maxTokens : 6000,
      ...(this.jsonMode ? { response_format: { type: 'json_object' } } : {}),
      messages: [
        { role: 'system', content: RECEIPT_SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            { type: 'text', text: buildReceiptUserText(input) },
            { type: 'image_url', image_url: { url: dataUri } },
          ],
        },
      ],
    };
  }

  private async call(
    input: ReceiptExtractInput,
    deadline: number,
    usage: ReceiptExtractUsage,
  ): Promise<ChatReply> {
    const url = `${this.options.baseUrl.replace(/\/+$/, '')}/chat/completions`;
    let transientRetries = 1;
    const retryTransient = async (reason: string, status: number) => {
      const canRetry = transientRetries > 0 && deadline - this.now() > MIN_RETRY_BUDGET_MS;
      console.warn(
        `[ReceiptScan] ${this.provider}/${this.model} unavailable reason=${reason} HTTP ${status}${canRetry ? ', retrying once' : ''}`,
      );
      if (!canRetry) throw receiptScanError('AI_UNAVAILABLE', 503, usage);
      transientRetries -= 1;
      await new Promise((resolve) => setTimeout(resolve, this.options.retryDelayMs ?? 1500));
    };

    for (;;) {
      const remaining = deadline - this.now();
      if (remaining <= 0) throw receiptScanError('AI_UNAVAILABLE', 503, usage);

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), remaining);
      let response: Response;
      let text: string;
      try {
        response = await this.fetchFn(url, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            // Explicit, so the call never depends on the runtime's default (Cloudflare in
            // front of some providers refuses unknown/default agents with 403 1010).
            'user-agent': RECEIPT_SCAN_USER_AGENT,
            ...this.options.extraHeaders,
            authorization: `Bearer ${this.options.apiKey}`,
          },
          body: JSON.stringify(this.body(input)),
          signal: controller.signal,
        });
        // The body counts against the budget too: some providers answer 200 at once and
        // keep the body open while the model thinks.
        text = await response.text();
      } catch (error) {
        const aborted = (error as { name?: string })?.name === 'AbortError';
        console.warn(
          `[ReceiptScan] ${this.provider}/${this.model} unavailable reason=${aborted ? 'timeout' : 'network'}`,
        );
        throw receiptScanError('AI_UNAVAILABLE', 503, usage);
      } finally {
        clearTimeout(timer);
      }

      if (!response.ok) {
        if (this.jsonMode && rejectsJsonMode(response.status, text)) {
          console.warn(
            `[ReceiptScan] ${this.provider}/${this.model} rejects response_format; using the prompt instruction`,
          );
          this.jsonMode = false;
          continue;
        }
        // Status, error type and a reason only: provider error bodies can echo parts of the request.
        const type = errorTypeOf(text);
        if (isTransient(response.status)) {
          await retryTransient(unavailableReason(response.status, type, text), response.status);
          continue;
        }
        console.warn(
          `[ReceiptScan] ${this.provider}/${this.model} unavailable reason=${unavailableReason(response.status, type, text)} HTTP ${response.status}${type ? ` (${type})` : ''}`,
        );
        throw receiptScanError('AI_UNAVAILABLE', 503, usage);
      }

      let reply: ChatReply;
      try {
        reply = JSON.parse(text) as ChatReply;
      } catch {
        throw receiptScanError('AI_UNAVAILABLE', 503, usage);
      }
      if (reply.error && !reply.choices?.length) {
        const code = Number(reply.error.code);
        const status = Number.isFinite(code) && code >= 400 ? code : 502;
        const reason = unavailableReason(status, null, String(reply.error.message ?? ''));
        if (isTransient(status)) {
          await retryTransient(`upstream_${reason}`, status);
          continue;
        }
        console.warn(
          `[ReceiptScan] ${this.provider}/${this.model} unavailable reason=upstream_${reason}`,
        );
        throw receiptScanError('AI_UNAVAILABLE', 503, usage);
      }
      if (reply.usage) {
        usage.inputTokens = (usage.inputTokens ?? 0) + (reply.usage.prompt_tokens ?? 0);
        usage.outputTokens = (usage.outputTokens ?? 0) + (reply.usage.completion_tokens ?? 0);
      }
      return reply;
    }
  }
}
