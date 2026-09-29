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
  /** Budget for the whole extraction, including the retry (default 25 s). */
  timeoutMs?: number;
  fetchFn?: typeof fetch;
  now?: () => number;
}

type ChatReply = {
  choices?: Array<{ message?: { content?: unknown } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
};

/** Something the provider said that means "try again without JSON mode". */
const rejectsJsonMode = (status: number, body: string) =>
  status === 400 && /response_format|json_object|json mode/i.test(body);

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
    this.timeoutMs = options.timeoutMs && options.timeoutMs > 0 ? options.timeoutMs : 25_000;
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
        // Invalid JSON or wrong shape: one more try while there's time left.
        lastError = error;
        if (deadline - this.now() < 3_000) break;
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
      max_tokens: 2000,
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

    for (;;) {
      const remaining = deadline - this.now();
      if (remaining <= 0) throw receiptScanError('AI_UNAVAILABLE', 503, usage);

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), remaining);
      let response: Response;
      try {
        response = await this.fetchFn(url, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${this.options.apiKey}`,
          },
          body: JSON.stringify(this.body(input)),
          signal: controller.signal,
        });
      } catch (error) {
        const aborted = (error as { name?: string })?.name === 'AbortError';
        console.warn(
          `[ReceiptScan] ${this.provider} request ${aborted ? 'timed out' : 'failed (network)'}`,
        );
        throw receiptScanError('AI_UNAVAILABLE', 503, usage);
      } finally {
        clearTimeout(timer);
      }

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        if (this.jsonMode && rejectsJsonMode(response.status, text)) {
          console.warn(
            `[ReceiptScan] ${this.provider}/${this.model} rejects response_format; using the prompt instruction`,
          );
          this.jsonMode = false;
          continue;
        }
        // Status and error type only: provider error bodies can echo parts of the request.
        const type = errorTypeOf(text);
        console.warn(
          `[ReceiptScan] ${this.provider} answered HTTP ${response.status}${type ? ` (${type})` : ''}`,
        );
        throw receiptScanError('AI_UNAVAILABLE', 503, usage);
      }

      let reply: ChatReply;
      try {
        reply = (await response.json()) as ChatReply;
      } catch {
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
