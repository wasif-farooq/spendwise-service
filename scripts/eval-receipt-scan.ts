/**
 * Receipt-scan accuracy check over tests/fixtures/receipts/ (12 photos + expected.json).
 * Prints the per-receipt and per-field hit rate: total, date, merchant, currency,
 * category, and NOT_A_RECEIPT for the non-receipt picture.
 *
 * Direct (default): calls the provider configured by the same env vars as the API,
 * through the real extractor and ReceiptScanService mapping, with the default
 * workspace categories. No API, database or Redis needed. To try another model:
 *
 *   AI_BASE_URL=https://openrouter.ai/api/v1 \
 *   AI_RECEIPT_MODEL=nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free \
 *   OPENROUTER_API_KEY=… pnpm eval:receipts
 *
 *   AI_BASE_URL=https://opencode.ai/zen/v1 AI_RECEIPT_MODEL=qwen3.5-plus \
 *   OPENCODE_API_KEY=… pnpm eval:receipts
 *
 * Through a running API instead (uses one of the owner's monthly scans per success,
 * and the 20/hour limiter; use a paid-plan user):
 *
 *   pnpm eval:receipts --api            with SCAN_EMAIL + SCAN_PASSWORD, or SCAN_TOKEN +
 *                                       SCAN_WORKSPACE_ID; API_URL (default :3000/api/v1)
 *
 * Other env: SCAN_ONLY=01-grocery-us,12-not-a-receipt · SCAN_DELAY_MS (default 2000) ·
 * SCAN_RETRIES=n to retry a 503 (provider unavailable) up to n times, SCAN_RETRY_DELAY_MS
 * apart (default 30000), so accuracy is measured on replies and availability separately ·
 * SCAN_JSON=1 to print every result.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { ConfigLoader } from '../src/config/ConfigLoader';
import {
  createReceiptExtractor,
  ReceiptAiConfig,
} from '../src/domains/ai/receipts/createReceiptExtractor';
import { ReceiptScanService } from '../src/domains/ai/receipts/ReceiptScanService';
import { ReceiptScanError } from '../src/domains/ai/receipts/types';

interface Expected {
  file: string;
  note?: string;
  total?: number;
  currency?: string;
  date?: string;
  merchant?: string;
  category?: string[];
  error?: string;
}

interface Outcome {
  status: number;
  ms: number;
  body: { data?: Record<string, any>; code?: string; message?: string };
}

const dir = join(__dirname, '..', 'tests', 'fixtures', 'receipts');
const expected: Record<string, Expected> = JSON.parse(
  readFileSync(join(dir, 'expected.json'), 'utf8'),
);
const viaApi = process.argv.includes('--api');
const only = process.env.SCAN_ONLY ? new Set(process.env.SCAN_ONLY.split(',')) : null;
const delayMs = Number(process.env.SCAN_DELAY_MS ?? 2000);
const retries = Number(process.env.SCAN_RETRIES ?? 0);
const retryDelayMs = Number(process.env.SCAN_RETRY_DELAY_MS ?? 30000);

/** The categories a new workspace starts with. */
const DEFAULT_CATEGORIES = [
  'Bills & Utilities',
  'Education',
  'Entertainment',
  'Food & Dining',
  'Health & Fitness',
  'Home & Garden',
  'Personal Care',
  'Shopping',
  'Transportation',
  'Travel',
].map((name, i) => ({ id: `cat-${i}`, name, type: 'expense' as const }));

async function directScanner() {
  const ai: ReceiptAiConfig = ConfigLoader.getInstance().get('ai') ?? {};
  const extractor = createReceiptExtractor(ai);
  if (!extractor) {
    console.error('No provider configured: set AI_BASE_URL, AI_RECEIPT_MODEL and the API key.');
    process.exit(2);
  }
  const service = new ReceiptScanService({
    extractor,
    repository: {
      countSuccessfulForOwnerSince: async () => 0,
      findAllowance: async () => ({
        ownerId: 'eval',
        hasSubscription: true,
        planName: 'Pro',
        snapshotLimit: -1,
        planLimit: -1,
      }),
      record: async () => undefined,
    },
    categories: { findAll: async () => DEFAULT_CATEGORIES },
    accounts: {
      findByWorkspaceId: async () => [
        { id: 'acc-usd', name: 'Everyday Checking', currency: 'USD' },
      ],
    },
    freeScansPerMonth: 5,
  });
  const label = `${ai.baseUrl} · ${ai.receiptModel} (direct)`;
  return {
    label,
    scan: async (image: Buffer): Promise<Outcome> => {
      const started = Date.now();
      try {
        const data = await service.scan({
          workspaceId: 'eval',
          userId: 'eval',
          image,
          mimeType: 'image/jpeg',
        });
        return { status: 200, ms: Date.now() - started, body: { data } };
      } catch (error) {
        const e = error as ReceiptScanError;
        return {
          status: e.statusCode ?? 500,
          ms: Date.now() - started,
          body: { code: e.code, message: e.message },
        };
      }
    },
  };
}

async function apiScanner() {
  const api = (process.env.API_URL || 'http://localhost:3000/api/v1').replace(/\/+$/, '');
  let token = process.env.SCAN_TOKEN;
  let workspaceId = process.env.SCAN_WORKSPACE_ID;
  if (!token || !workspaceId) {
    const login = await fetch(`${api}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: process.env.SCAN_EMAIL, password: process.env.SCAN_PASSWORD }),
    }).then((r) => r.json() as Promise<any>);
    token = (login?.data ?? login)?.token;
    if (!token)
      throw new Error(
        'login failed: set SCAN_EMAIL + SCAN_PASSWORD or SCAN_TOKEN + SCAN_WORKSPACE_ID',
      );
    const list = await fetch(`${api}/workspaces`, {
      headers: { authorization: `Bearer ${token}` },
    }).then((r) => r.json() as Promise<any>);
    const workspaces = Array.isArray(list?.data ?? list)
      ? (list?.data ?? list)
      : (list?.data?.workspaces ?? []);
    workspaceId = workspaceId || workspaces[0]?.id;
  }
  return {
    label: `${api} (workspace ${workspaceId})`,
    scan: async (image: Buffer, file: string): Promise<Outcome> => {
      const form = new FormData();
      form.append('file', new Blob([new Uint8Array(image)], { type: 'image/jpeg' }), file);
      const started = Date.now();
      const res = await fetch(`${api}/${workspaceId}/ai/receipt-scan`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}` },
        body: form,
      });
      return {
        status: res.status,
        ms: Date.now() - started,
        body: (await res.json().catch(() => ({}))) as Outcome['body'],
      };
    },
  };
}

const norm = (s: unknown) =>
  String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(the|inc|llc|ltd|gmbh|store|market)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** "Oak & Iron Hardware" ~ "OAK AND IRON HARDWARE"; containment either way. */
const merchantHit = (want: unknown, got: unknown) => {
  const a = norm(want);
  const b = norm(got);
  return Boolean(a && b && (a.includes(b) || b.includes(a)));
};

const FIELDS = ['total', 'date', 'merchant', 'currency', 'category'] as const;
type Field = (typeof FIELDS)[number];

async function main() {
  const scanner = viaApi ? await apiScanner() : await directScanner();
  const tally = Object.fromEntries(FIELDS.map((f) => [f, { hit: 0, of: 0 }])) as Record<
    Field,
    { hit: number; of: number }
  >;
  const notReceipt = { hit: 0, of: 0 };
  const statuses: Record<number, number> = {};
  const raw: Record<string, Outcome> = {};
  const rows: string[] = [];
  const times: number[] = [];
  let attemptsTotal = 0;
  let unavailableTotal = 0;

  const entries = Object.entries(expected).filter(([id]) => !only || only.has(id));
  for (const [i, [id, want]] of entries.entries()) {
    if (i > 0 && delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
    const image = readFileSync(join(dir, want.file));
    let out = await scanner.scan(image, want.file);
    let attempts = 1;
    for (; out.status === 503 && attempts <= retries; attempts++) {
      unavailableTotal += 1;
      await new Promise((r) => setTimeout(r, retryDelayMs));
      out = await scanner.scan(image, want.file);
    }
    if (out.status === 503) unavailableTotal += 1;
    attemptsTotal += attempts;
    raw[id] = out;
    statuses[out.status] = (statuses[out.status] ?? 0) + 1;
    times.push(out.ms);
    const head = `  ${id.padEnd(24)} HTTP ${out.status}  ${String(out.ms).padStart(6)} ms  x${attempts}`;

    if (want.error) {
      notReceipt.of += 1;
      const ok = out.body.code === want.error;
      if (ok) notReceipt.hit += 1;
      rows.push(
        `${head}  ${ok ? 1 : 0}/1  ${ok ? want.error : `got ${out.body.code ?? out.status}`}`,
      );
      continue;
    }

    const got = out.status === 200 ? out.body.data : undefined;
    const checks: Record<Field, boolean> = {
      total: !!got && Math.abs(Number(got.total) - (want.total ?? NaN)) < 0.005,
      date: !!got && got.date === want.date,
      merchant: !!got && merchantHit(want.merchant, got.merchant),
      currency: !!got && got.currency === want.currency,
      category: !!got && (want.category ?? []).includes(got.categoryName),
    };
    let hits = 0;
    for (const f of FIELDS) {
      tally[f].of += 1;
      if (checks[f]) {
        tally[f].hit += 1;
        hits += 1;
      }
    }
    const misses = FIELDS.filter((f) => !checks[f]).map((f) => {
      if (!got) return f;
      const value = f === 'category' ? got.categoryName : got[f];
      const wanted = f === 'category' ? want.category?.[0] : want[f];
      return `${f}=${JSON.stringify(value)} (want ${JSON.stringify(wanted)})`;
    });
    const detail = got
      ? misses.length
        ? misses.join('; ')
        : 'all fields'
      : `${out.body.code ?? ''} ${out.body.message ?? ''}`.trim();
    rows.push(`${head}  ${hits}/${FIELDS.length}  ${detail}`);
  }

  const pct = (h: number, o: number) => (o ? `${((100 * h) / o).toFixed(0)}%` : 'n/a');
  console.log(`\nReceipt scan accuracy: ${scanner.label}\n\nPer receipt`);
  rows.forEach((r) => console.log(r));
  console.log('\nPer field');
  let hit = notReceipt.hit;
  let of = notReceipt.of;
  for (const f of FIELDS) {
    hit += tally[f].hit;
    of += tally[f].of;
    console.log(
      `  ${f.padEnd(11)} ${String(tally[f].hit).padStart(2)}/${tally[f].of}  ${pct(tally[f].hit, tally[f].of)}`,
    );
  }
  console.log(
    `  ${'not-receipt'.padEnd(11)} ${String(notReceipt.hit).padStart(2)}/${notReceipt.of}  ${pct(notReceipt.hit, notReceipt.of)}`,
  );
  const sorted = [...times].sort((a, b) => a - b);
  console.log(`\n  all fields  ${hit}/${of}  ${pct(hit, of)}`);
  console.log(
    `  latency     median ${sorted[Math.floor(sorted.length / 2)] ?? 0} ms, max ${sorted[sorted.length - 1] ?? 0} ms`,
  );
  console.log(`  statuses    ${JSON.stringify(statuses)}`);
  console.log(
    `  provider    ${attemptsTotal - unavailableTotal}/${attemptsTotal} attempts answered (${unavailableTotal} × 503 AI_UNAVAILABLE)`,
  );
  if (process.env.SCAN_JSON) console.log(JSON.stringify(raw, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
