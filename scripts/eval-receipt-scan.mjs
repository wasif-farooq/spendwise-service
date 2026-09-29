#!/usr/bin/env node
/**
 * Receipt-scan accuracy check: sends every fixture in tests/fixtures/receipts/
 * through a running API and prints the per-field and per-receipt hit rate
 * against expected.json.
 *
 *   SCAN_TOKEN=<access token> SCAN_WORKSPACE_ID=<uuid> node scripts/eval-receipt-scan.mjs
 *   SCAN_EMAIL=… SCAN_PASSWORD=… node scripts/eval-receipt-scan.mjs        (logs in first)
 *
 * Options (env): API_URL (default http://localhost:3000/api/v1), SCAN_DELAY_MS
 * (pause between scans, default 1500), SCAN_ONLY (comma-separated fixture ids),
 * SCAN_JSON=1 (also print the raw results as JSON).
 *
 * Each successful scan uses one of the workspace owner's monthly scans, and the
 * endpoint allows 20 scans per user per hour: use a paid-plan user.
 *
 * Scoring: total and date exact; currency exact; merchant by normalised
 * containment ("Oak & Iron Hardware" ~ "OAK AND IRON HARDWARE"); category when
 * the returned categoryName is one of the accepted names. The non-receipt
 * fixture scores 1/1 when the API answers 422 NOT_A_RECEIPT.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'tests', 'fixtures', 'receipts');
const API = (process.env.API_URL || 'http://localhost:3000/api/v1').replace(/\/+$/, '');
const DELAY = Number(process.env.SCAN_DELAY_MS ?? 1500);
const only = process.env.SCAN_ONLY ? new Set(process.env.SCAN_ONLY.split(',')) : null;
const expected = JSON.parse(readFileSync(join(dir, 'expected.json'), 'utf8'));

const unwrap = (body) => body?.data ?? body;

async function session() {
  if (process.env.SCAN_TOKEN && process.env.SCAN_WORKSPACE_ID) {
    return { token: process.env.SCAN_TOKEN, workspaceId: process.env.SCAN_WORKSPACE_ID };
  }
  const { SCAN_EMAIL: email, SCAN_PASSWORD: password } = process.env;
  if (!email || !password) {
    console.error('Set SCAN_TOKEN + SCAN_WORKSPACE_ID, or SCAN_EMAIL + SCAN_PASSWORD.');
    process.exit(2);
  }
  const login = unwrap(
    await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
    }).then((r) => r.json()),
  );
  const token = login?.token;
  if (!token) throw new Error('login failed');
  const list = unwrap(await fetch(`${API}/workspaces`, { headers: { authorization: `Bearer ${token}` } }).then((r) => r.json()));
  const workspaces = Array.isArray(list) ? list : list?.workspaces ?? [];
  return { token, workspaceId: process.env.SCAN_WORKSPACE_ID || workspaces[0]?.id };
}

const norm = (s) =>
  String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(the|inc|llc|ltd|gmbh|store|market)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const merchantHit = (want, got) => {
  const a = norm(want);
  const b = norm(got);
  return Boolean(a && b && (a.includes(b) || b.includes(a)));
};

const FIELDS = ['total', 'date', 'merchant', 'currency', 'category'];

async function main() {
  const { token, workspaceId } = await session();
  const tally = Object.fromEntries(FIELDS.map((f) => [f, { hit: 0, of: 0 }]));
  const notReceipt = { hit: 0, of: 0 };
  const rows = [];
  const raw = {};
  const statuses = {};

  const entries = Object.entries(expected).filter(([id]) => !only || only.has(id));
  for (const [i, [id, want]] of entries.entries()) {
    if (i > 0 && DELAY > 0) await new Promise((r) => setTimeout(r, DELAY));
    const form = new FormData();
    form.append('file', new Blob([readFileSync(join(dir, want.file))], { type: 'image/jpeg' }), want.file);
    const started = Date.now();
    const res = await fetch(`${API}/${workspaceId}/ai/receipt-scan`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
      body: form,
    });
    const ms = Date.now() - started;
    const body = await res.json().catch(() => ({}));
    raw[id] = { status: res.status, ms, body };
    statuses[res.status] = (statuses[res.status] ?? 0) + 1;

    if (want.error) {
      notReceipt.of += 1;
      const ok = body?.code === want.error;
      if (ok) notReceipt.hit += 1;
      rows.push({ id, status: res.status, ms, score: `${ok ? 1 : 0}/1`, detail: ok ? want.error : `got ${body?.code ?? res.status}` });
      continue;
    }

    const got = res.ok ? unwrap(body) : null;
    const checks = {
      total: got && Math.abs(Number(got.total) - want.total) < 0.005,
      date: got && got.date === want.date,
      merchant: got && merchantHit(want.merchant, got.merchant),
      currency: got && got.currency === want.currency,
      category: got && (want.category ?? []).includes(got.categoryName),
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
      if (!got) return `${f}`;
      const value = f === 'category' ? got.categoryName : got[f];
      return `${f}=${JSON.stringify(value)} (want ${JSON.stringify(f === 'category' ? want.category?.[0] : want[f])})`;
    });
    rows.push({
      id,
      status: res.status,
      ms,
      score: `${hits}/${FIELDS.length}`,
      detail: got ? (misses.length ? misses.join('; ') : 'all fields') : `${body?.code ?? ''} ${body?.message ?? ''}`.trim(),
    });
  }

  const pct = (h, o) => (o ? `${((100 * h) / o).toFixed(0)}%` : 'n/a');
  console.log(`\nReceipt scan accuracy: ${API} (workspace ${workspaceId})\n`);
  console.log('Per receipt');
  for (const r of rows) {
    console.log(`  ${r.id.padEnd(24)} HTTP ${r.status}  ${String(r.ms).padStart(6)} ms  ${r.score.padStart(4)}  ${r.detail}`);
  }
  console.log('\nPer field');
  let allHit = 0;
  let allOf = 0;
  for (const f of FIELDS) {
    const { hit, of } = tally[f];
    allHit += hit;
    allOf += of;
    console.log(`  ${f.padEnd(10)} ${String(hit).padStart(2)}/${of}  ${pct(hit, of)}`);
  }
  console.log(`  ${'not-receipt'.padEnd(10)} ${String(notReceipt.hit).padStart(2)}/${notReceipt.of}  ${pct(notReceipt.hit, notReceipt.of)}`);
  console.log(`\n  all fields ${allHit + notReceipt.hit}/${allOf + notReceipt.of}  ${pct(allHit + notReceipt.hit, allOf + notReceipt.of)}`);
  console.log(`  HTTP statuses: ${JSON.stringify(statuses)}`);
  if (process.env.SCAN_JSON) console.log(JSON.stringify(raw, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
