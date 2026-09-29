import {
  OpenAICompatibleReceiptExtractor,
  RECEIPT_SCAN_USER_AGENT,
  errorTypeOf,
  unavailableReason,
} from '@domains/ai/receipts/OpenAICompatibleReceiptExtractor';
import { createReceiptExtractor } from '@domains/ai/receipts/createReceiptExtractor';
import { ReceiptSchema, parseReceiptReply } from '@domains/ai/receipts/receiptSchema';
import { ReceiptScanError } from '@domains/ai/receipts/types';

const IMAGE = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
const INPUT = {
  image: IMAGE,
  mimeType: 'image/jpeg' as const,
  categories: ['Groceries', 'Dining'],
  currencyHint: 'USD',
  today: '2026-09-29',
};

const GOOD = {
  isReceipt: true,
  merchant: 'Corner Market',
  total: 23.45,
  subtotal: 21.5,
  tax: 1.95,
  currency: 'USD',
  date: '2026-09-20',
  category: 'Groceries',
  lineItems: [{ description: 'Milk', amount: 3.5 }],
  confidence: { total: 0.95, date: 0.9, merchant: 0.9 },
};

const reply = (
  content: string,
  status = 200,
  usage = { prompt_tokens: 900, completion_tokens: 120 },
) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => ({ choices: [{ message: { content } }], usage }),
    text: async () => content,
  }) as unknown as Response;

const build = (fetchFn: jest.Mock, extra: Partial<{ timeoutMs: number; now: () => number }> = {}) =>
  new OpenAICompatibleReceiptExtractor({
    provider: 'opencode',
    baseUrl: 'https://opencode.ai/zen/v1/',
    apiKey: 'test-key',
    model: 'mimo-v2.5-free',
    fetchFn: fetchFn as unknown as typeof fetch,
    retryDelayMs: 0,
    ...extra,
  });

beforeEach(() => {
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('OpenAICompatibleReceiptExtractor', () => {
  it('posts an image_url data URI with JSON mode to /chat/completions', async () => {
    const fetchFn = jest.fn().mockResolvedValue(reply(JSON.stringify(GOOD)));
    const result = await build(fetchFn).extract(INPUT);

    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe('https://opencode.ai/zen/v1/chat/completions');
    expect(init.method).toBe('POST');
    expect(init.headers.authorization).toBe('Bearer test-key');
    expect(init.headers['user-agent']).toBe(RECEIPT_SCAN_USER_AGENT);
    const body = JSON.parse(init.body);
    expect(body.model).toBe('mimo-v2.5-free');
    expect(body.response_format).toEqual({ type: 'json_object' });
    expect(body.max_tokens).toBe(6000);
    expect(body.messages[0].role).toBe('system');
    const parts = body.messages[1].content;
    expect(parts[0].type).toBe('text');
    expect(parts[0].text).toContain('"Groceries"');
    expect(parts[1]).toEqual({
      type: 'image_url',
      image_url: { url: `data:image/jpeg;base64,${IMAGE.toString('base64')}` },
    });

    expect(result.receipt.total).toBe(23.45);
    expect(result.receipt.category).toBe('Groceries');
    expect(result.usage).toEqual({ inputTokens: 900, outputTokens: 120 });
    expect(result.model).toBe('mimo-v2.5-free');
  });

  it('retries once on invalid JSON, then succeeds', async () => {
    const fetchFn = jest
      .fn()
      .mockResolvedValueOnce(reply('Sure! Here is the receipt: total 23.45'))
      .mockResolvedValueOnce(reply('```json\n' + JSON.stringify(GOOD) + '\n```'));

    const result = await build(fetchFn).extract(INPUT);

    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(result.receipt.merchant).toBe('Corner Market');
    expect(result.usage.inputTokens).toBe(1800);
  });

  it('gives up with 422 UNREADABLE after two invalid replies', async () => {
    const fetchFn = jest.fn().mockResolvedValue(reply('{"isReceipt": "maybe"}'));

    await expect(build(fetchFn).extract(INPUT)).rejects.toMatchObject({
      code: 'UNREADABLE',
      statusCode: 422,
    });
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('retries a provider 429 once, then answers 503 AI_UNAVAILABLE', async () => {
    const fetchFn = jest.fn().mockResolvedValue(reply('rate limited', 429));

    const error = await build(fetchFn)
      .extract(INPUT)
      .catch((e) => e);
    expect(error).toBeInstanceOf(ReceiptScanError);
    expect(error).toMatchObject({ code: 'AI_UNAVAILABLE', statusCode: 503 });
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('recovers when the retry after a transient failure succeeds', async () => {
    const fetchFn = jest
      .fn()
      .mockResolvedValueOnce(reply('busy', 503))
      .mockResolvedValueOnce(reply(JSON.stringify(GOOD)));
    await expect(build(fetchFn).extract(INPUT)).resolves.toMatchObject({
      receipt: { total: 23.45 },
    });
  });

  it('treats HTTP 200 with an upstream error body (OpenRouter) as a transient failure', async () => {
    const upstream = {
      ok: true,
      status: 200,
      json: async () => ({
        error: { code: 502, message: 'Upstream error: request limit reached' },
      }),
      text: async () => '',
    } as unknown as Response;
    const fetchFn = jest
      .fn()
      .mockResolvedValueOnce(upstream)
      .mockResolvedValueOnce(reply(JSON.stringify(GOOD)));
    await expect(build(fetchFn).extract(INPUT)).resolves.toMatchObject({
      receipt: { merchant: 'Corner Market' },
    });

    const always = jest.fn().mockResolvedValue(upstream);
    await expect(build(always).extract(INPUT)).rejects.toMatchObject({ code: 'AI_UNAVAILABLE' });
    expect(always).toHaveBeenCalledTimes(2);
  });

  it('does not retry refusals (bad key, free tier, no funds)', async () => {
    for (const status of [401, 402, 403]) {
      const fetchFn = jest
        .fn()
        .mockResolvedValue(reply('{"error":{"type":"FreeTierError"}}', status));
      await expect(build(fetchFn).extract(INPUT)).rejects.toMatchObject({ code: 'AI_UNAVAILABLE' });
      expect(fetchFn).toHaveBeenCalledTimes(1);
    }
  });

  it('maps provider 5xx and auth refusals to 503', async () => {
    for (const status of [500, 502, 401, 403]) {
      const fetchFn = jest.fn().mockResolvedValue(reply('nope', status));
      await expect(build(fetchFn).extract(INPUT)).rejects.toMatchObject({ code: 'AI_UNAVAILABLE' });
    }
  });

  it('times out with 503 AI_UNAVAILABLE', async () => {
    const fetchFn = jest.fn(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () =>
            reject(Object.assign(new Error('aborted'), { name: 'AbortError' })),
          );
        }),
    );

    await expect(
      build(fetchFn as jest.Mock, { timeoutMs: 30 }).extract(INPUT),
    ).rejects.toMatchObject({
      code: 'AI_UNAVAILABLE',
      statusCode: 503,
    });
  });

  it('falls back to the prompt instruction when response_format is rejected', async () => {
    const fetchFn = jest
      .fn()
      .mockResolvedValueOnce(reply('{"error":"response_format is not supported"}', 400))
      .mockResolvedValueOnce(reply(JSON.stringify(GOOD)));

    const extractor = build(fetchFn);
    const result = await extractor.extract(INPUT);

    expect(result.receipt.total).toBe(23.45);
    expect(JSON.parse(fetchFn.mock.calls[1][1].body).response_format).toBeUndefined();
    expect(extractor.usesJsonMode).toBe(false);
  });
});

describe('unavailableReason', () => {
  it('names why the provider refused (logged; the client always gets 503)', () => {
    expect(unavailableReason(403, 'FreeTierError', '')).toBe('free_tier_refused');
    expect(unavailableReason(402, null, 'Insufficient account funds')).toBe('insufficient_funds');
    expect(unavailableReason(400, null, 'insufficient credits')).toBe('insufficient_funds');
    expect(unavailableReason(401, null, '')).toBe('bad_api_key');
    expect(unavailableReason(403, null, 'Model access is disabled')).toBe('model_disabled');
    expect(unavailableReason(429, null, '')).toBe('rate_limited');
    expect(unavailableReason(502, null, '')).toBe('provider_error');
  });

  it('maps 402 insufficient funds to 503 AI_UNAVAILABLE', async () => {
    const fetchFn = jest
      .fn()
      .mockResolvedValue(reply('{"error":{"message":"Insufficient account funds"}}', 402));
    await expect(build(fetchFn).extract(INPUT)).rejects.toMatchObject({
      code: 'AI_UNAVAILABLE',
      statusCode: 503,
    });
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('reason=insufficient_funds'));
  });
});

describe('errorTypeOf', () => {
  it('keeps only a bare error identifier from provider bodies', () => {
    expect(
      errorTypeOf(
        '{"type":"error","error":{"type":"FreeTierError","message":"free tier only in OpenCode"}}',
      ),
    ).toBe('FreeTierError');
    expect(errorTypeOf('{"error":{"type":"bad thing: data:image/jpeg;base64,AAAA"}}')).toBeNull();
    expect(errorTypeOf('<html>502</html>')).toBeNull();
  });
});

describe('reply parsing (model-neutral)', () => {
  it('drops <think> blocks, fences and chatter, and takes the first balanced object', () => {
    const noisy = `<think>The total is {maybe} 23.45? Let me check {"isReceipt": false}</think>
Sure! Here you go:
\`\`\`json
${JSON.stringify({ ...GOOD, merchant: 'Brace } Store' })}
\`\`\`
Also: {"not": "this one"}`;
    const parsed = parseReceiptReply(noisy);
    expect(parsed.merchant).toBe('Brace } Store');
    expect(parsed.total).toBe(23.45);
  });

  it('skips a brace block that is not JSON', () => {
    expect(parseReceiptReply(`Total {approx} → ${JSON.stringify(GOOD)}`).isReceipt).toBe(true);
  });

  it('ignores an unterminated <think>', () => {
    expect(() => parseReceiptReply('<think>{"isReceipt": true, "total": 1}')).toThrow();
  });
});

describe('ReceiptSchema', () => {
  it('coerces numeric strings and decimal commas', () => {
    const parsed = parseReceiptReply(
      JSON.stringify({ ...GOOD, total: '€12,50', subtotal: '1,234.56', tax: null }),
    );
    expect(parsed.total).toBe(12.5);
    expect(parsed.subtotal).toBe(1234.56);
  });

  it('fills missing optional fields with nulls', () => {
    const parsed = ReceiptSchema.parse({ isReceipt: false });
    expect(parsed).toMatchObject({
      merchant: null,
      total: null,
      lineItems: [],
      confidence: { total: null, date: null, merchant: null },
    });
  });
});

describe('createReceiptExtractor', () => {
  it('returns null without an API key', () => {
    expect(
      createReceiptExtractor({
        receiptProvider: 'opencode',
        baseUrl: 'x',
        receiptModel: 'm',
        apiKey: '',
      }),
    ).toBeNull();
    expect(createReceiptExtractor(undefined)).toBeNull();
  });

  it('adds OpenRouter attribution headers', async () => {
    const extractor = createReceiptExtractor({
      receiptProvider: 'openrouter',
      baseUrl: 'https://openrouter.ai/api/v1',
      receiptModel: 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free',
      apiKey: 'k',
    }) as OpenAICompatibleReceiptExtractor;
    const fetchFn = jest.fn().mockResolvedValue(reply(JSON.stringify(GOOD)));
    (extractor as any).fetchFn = fetchFn;
    await extractor.extract(INPUT);
    const headers = fetchFn.mock.calls[0][1].headers;
    expect(headers['HTTP-Referer']).toBe('https://trackmypocket.com');
    expect(headers['X-Title']).toBe('TrackMyPocket');
    expect(fetchFn.mock.calls[0][0]).toBe('https://openrouter.ai/api/v1/chat/completions');
  });

  it('builds the OpenAI-compatible extractor for opencode', () => {
    const extractor = createReceiptExtractor({
      receiptProvider: 'opencode',
      baseUrl: 'https://opencode.ai/zen/v1',
      receiptModel: 'mimo-v2.5-free',
      apiKey: 'k',
    });
    expect(extractor).toBeInstanceOf(OpenAICompatibleReceiptExtractor);
    expect(extractor?.model).toBe('mimo-v2.5-free');
  });
});
