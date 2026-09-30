import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import type { RateLimitStore } from '@shared/middleware/rateLimit.middleware';
import { ReceiptScanService } from '@domains/ai/receipts/ReceiptScanService';
import type { IReceiptScanRepository } from '@domains/ai/receipts/ReceiptScanRepository';
import type { ReceiptExtractor } from '@domains/ai/receipts/types';

/**
 * Drives the real receipt-scan router (auth, quota, limiter, upload, controller,
 * service) with the permission check, database and provider stubbed.
 */

jest.mock('@config/ConfigLoader', () => ({
  ConfigLoader: {
    getInstance: () => ({
      get: (key: string) => ({ 'auth.jwt.secret': 'unit-test-secret' })[key],
    }),
  },
}));

jest.mock('@monitoring/logging/StructuredLogger', () => ({
  StructuredLogger: jest
    .fn()
    .mockImplementation(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() })),
}));

const mockPermission = { allowed: true };
jest.mock('@shared/middleware/permission.middleware', () => ({
  requirePermission: () => (_req: any, res: any, next: any) =>
    mockPermission.allowed ? next() : res.status(403).json({ message: 'Forbidden' }),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createReceiptScanRouter } = require('@domains/ai/routes/receipt-scan.routes');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createReceiptScanLimiter } = require('@domains/ai/receipts/receiptScan.middleware');

const WS = '11111111-1111-4111-8111-111111111111';
const token = jwt.sign({ userId: 'user-1', purpose: 'access' }, 'unit-test-secret');
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 1)]);
const PDF = Buffer.from('%PDF-1.7\n...');

const memoryStore = (): RateLimitStore => {
  const counts = new Map<string, number>();
  return {
    async hit(key: string) {
      const next = (counts.get(key) ?? 0) + 1;
      counts.set(key, next);
      return next;
    },
  };
};

const build = (
  opts: {
    plan?: 'Free' | 'Pro Monthly';
    extractor?: ReceiptExtractor | null;
    failWith?: Error;
    flag?: boolean | (() => Promise<boolean>);
  } = {},
) => {
  let used = 0;
  const repository: IReceiptScanRepository = {
    countSuccessfulForOwnerSince: jest.fn(async () => used),
    findAllowance: jest.fn(async () => ({
      ownerId: 'owner-1',
      hasSubscription: true,
      planName: opts.plan ?? 'Free',
      snapshotLimit: (opts.plan ?? 'Free') === 'Free' ? 5 : -1,
      planLimit: undefined,
    })),
    record: jest.fn(async (row) => {
      if (row.outcome === 'success') used += 1;
    }),
  };
  const extractor: ReceiptExtractor =
    opts.extractor === undefined
      ? {
          provider: 'opencode',
          model: 'mimo-v2.5-free',
          extract: jest.fn(async () => {
            if (opts.failWith) throw opts.failWith;
            return {
              receipt: {
                isReceipt: true,
                merchant: 'Corner Market',
                total: 12.5,
                subtotal: null,
                tax: null,
                currency: 'USD',
                date: '2026-09-20',
                category: 'Groceries',
                lineItems: [],
                confidence: { total: 0.9, date: 0.9, merchant: 0.9 },
              },
              usage: { inputTokens: 10, outputTokens: 5 },
              provider: 'opencode',
              model: 'mimo-v2.5-free',
            };
          }),
        }
      : (opts.extractor as ReceiptExtractor);

  const service = new ReceiptScanService({
    extractor: opts.extractor === null ? null : extractor,
    repository,
    categories: { findAll: async () => [{ id: 'cat-g', name: 'Groceries', type: 'expense' }] },
    accounts: {
      findByWorkspaceId: async () => [{ id: 'acc-1', name: 'Checking', currency: 'USD' }],
    },
    freeScansPerMonth: 5,
  });

  const app = express();
  app.use(
    '/v1',
    createReceiptScanRouter(async () => service, {
      limiter: createReceiptScanLimiter(memoryStore()),
      isEnabled: typeof opts.flag === 'function' ? opts.flag : async () => opts.flag ?? true,
    }),
  );
  return { app, repository };
};

const post = (
  app: express.Express,
  file: Buffer | null = JPEG,
  name = 'r.jpg',
  type = 'image/jpeg',
) => {
  const req = request(app)
    .post(`/v1/${WS}/ai/receipt-scan`)
    .set('Authorization', `Bearer ${token}`);
  return file ? req.attach('file', file, { filename: name, contentType: type }) : req;
};

beforeEach(() => {
  mockPermission.allowed = true;
  jest.spyOn(console, 'info').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('POST /v1/:workspaceId/ai/receipt-scan', () => {
  it('scans a JPEG and returns the prefill with usage', async () => {
    const res = await post(build().app);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      merchant: 'Corner Market',
      total: 12.5,
      categoryId: 'cat-g',
      suggestedAccountId: 'acc-1',
      usage: { used: 1, limit: 5 },
    });
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('requires a session and the create permission', async () => {
    const { app } = build();
    expect((await request(app).post(`/v1/${WS}/ai/receipt-scan`)).status).toBe(401);
    mockPermission.allowed = false;
    expect((await post(app)).status).toBe(403);
  });

  it('Free: the 5th scan passes, the 6th answers 402 SCAN_LIMIT_REACHED', async () => {
    const { app } = build();
    for (let i = 0; i < 5; i++) expect((await post(app)).status).toBe(200);
    const res = await post(app);
    expect(res.status).toBe(402);
    expect(res.body).toMatchObject({
      code: 'SCAN_LIMIT_REACHED',
      feature: 'receiptScans',
      usage: { used: 5, limit: 5 },
    });
    expect(res.body.message).toMatch(/limit of 5 receipt scans/);
  });

  it('failed scans do not use the allowance', async () => {
    const { app } = build({
      extractor: {
        provider: 'opencode',
        model: 'm',
        extract: jest.fn(async () => ({
          receipt: {
            isReceipt: false,
            merchant: null,
            total: null,
            subtotal: null,
            tax: null,
            currency: null,
            date: null,
            category: null,
            lineItems: [],
            confidence: { total: null, date: null, merchant: null },
          },
          usage: { inputTokens: 1, outputTokens: 1 },
          provider: 'opencode',
          model: 'm',
        })),
      },
    });
    for (let i = 0; i < 7; i++) {
      const res = await post(app);
      expect(res.status).toBe(422);
      expect(res.body.code).toBe('NOT_A_RECEIPT');
    }
  });

  it('Pro is unlimited (until the fair-use limiter: 20/hour → 429 TOO_MANY_SCANS)', async () => {
    const { app } = build({ plan: 'Pro Monthly' });
    for (let i = 0; i < 20; i++) expect((await post(app)).status).toBe(200);
    const res = await post(app);
    expect(res.status).toBe(429);
    expect(res.body.code).toBe('TOO_MANY_SCANS');
  });

  it('413 FILE_TOO_LARGE over 10 MB', async () => {
    const big = Buffer.concat([JPEG, Buffer.alloc(10 * 1024 * 1024 + 1)]);
    const res = await post(build().app, big);
    expect(res.status).toBe(413);
    expect(res.body.code).toBe('FILE_TOO_LARGE');
  });

  it('415 PDF_NOT_SUPPORTED for PDFs, by declared type or by content', async () => {
    const declared = await post(build().app, PDF, 'r.pdf', 'application/pdf');
    expect(declared.status).toBe(415);
    expect(declared.body.code).toBe('PDF_NOT_SUPPORTED');

    const disguised = await post(build().app, PDF, 'r.jpg', 'image/jpeg');
    expect(disguised.status).toBe(415);
    expect(disguised.body.code).toBe('PDF_NOT_SUPPORTED');
  });

  it('415 UNSUPPORTED_TYPE for other files', async () => {
    const heic = await post(build().app, Buffer.from('....ftypheic'), 'r.heic', 'image/heic');
    expect(heic.status).toBe(415);
    expect(heic.body.code).toBe('UNSUPPORTED_TYPE');

    const fake = await post(build().app, Buffer.from('not an image'), 'r.png', 'image/png');
    expect(fake.body.code).toBe('UNSUPPORTED_TYPE');
  });

  it('400 FILE_REQUIRED without a file', async () => {
    const res = await post(build().app, null);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('FILE_REQUIRED');
  });

  it('503 AI_UNAVAILABLE without a configured provider', async () => {
    const res = await post(build({ extractor: null }).app);
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('AI_UNAVAILABLE');
  });
});

describe('GET /v1/:workspaceId/ai/receipt-scan/usage', () => {
  it('returns used, limit and resetsAt', async () => {
    const res = await request(build().app)
      .get(`/v1/${WS}/ai/receipt-scan/usage`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      used: 0,
      limit: 5,
      resetsAt: expect.stringMatching(/T00:00:00.000Z$/),
    });
  });

  it('limit is null on paid plans', async () => {
    const res = await request(build({ plan: 'Pro Monthly' }).app)
      .get(`/v1/${WS}/ai/receipt-scan/usage`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.body.data.limit).toBeNull();
  });
});

describe('receiptScan feature flag', () => {
  const usage = (app: express.Express) =>
    request(app).get(`/v1/${WS}/ai/receipt-scan/usage`).set('Authorization', `Bearer ${token}`);

  it('flag off: scan answers 404 FEATURE_DISABLED without touching the provider', async () => {
    const extract = jest.fn();
    const { app, repository } = build({
      flag: false,
      extractor: { provider: 'opencode', model: 'm', extract },
    });
    const res = await post(app);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      message: 'Receipt scanning is not available.',
      code: 'FEATURE_DISABLED',
    });
    expect(extract).not.toHaveBeenCalled();
    expect(repository.findAllowance).not.toHaveBeenCalled();
    expect(repository.record).not.toHaveBeenCalled();
  });

  it('flag off: usage answers 404 FEATURE_DISABLED', async () => {
    const res = await usage(build({ flag: false }).app);
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('FEATURE_DISABLED');
  });

  it('flag off: 404 comes before the session check', async () => {
    const res = await request(build({ flag: false }).app).post(`/v1/${WS}/ai/receipt-scan`);
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('FEATURE_DISABLED');
  });

  it('a failed flag lookup counts as off', async () => {
    const { app } = build({
      flag: async () => {
        throw new Error('db down');
      },
    });
    expect((await post(app)).status).toBe(404);
    expect((await usage(app)).body.code).toBe('FEATURE_DISABLED');
  });

  it('by default reads `receiptScan` from the registered FeatureFlagService', async () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { Container } = require('@di/Container');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { TOKENS } = require('@di/tokens');
    const isEnabled = jest.fn(async () => false);
    Container.getInstance().registerInstance(TOKENS.FeatureFlagService, { isEnabled });
    const app = express();
    app.use(
      '/v1',
      createReceiptScanRouter(async () => ({}) as ReceiptScanService),
    );
    const res = await request(app)
      .get(`/v1/${WS}/ai/receipt-scan/usage`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
    expect(isEnabled).toHaveBeenCalledWith('receiptScan');
  });

  it('reads the flag on every request, so turning it on needs no restart', async () => {
    let on = false;
    const { app } = build({ flag: async () => on });
    expect((await usage(app)).status).toBe(404);
    on = true;
    expect((await usage(app)).status).toBe(200);
  });
});

describe('global error middleware: upload limits', () => {
  it('answers 413 FILE_TOO_LARGE for a MulterError instead of 500', async () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const multer = require('multer');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { errorMiddleware } = require('@shared/middleware/error.middleware');
    const app = express();
    app.post(
      '/upload',
      multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 } }).single('file'),
      (_req, res) => {
        res.json({ ok: true });
      },
    );
    app.use(errorMiddleware);

    const res = await request(app).post('/upload').attach('file', Buffer.alloc(100), 'big.jpg');
    expect(res.status).toBe(413);
    expect(res.body.code).toBe('FILE_TOO_LARGE');
  });
});
