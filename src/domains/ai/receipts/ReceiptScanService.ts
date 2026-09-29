import type { IReceiptScanRepository, ReceiptScanOutcome } from './ReceiptScanRepository';
import {
  ReceiptExtractor,
  ReceiptImageMimeType,
  ReceiptScanError,
  RawReceipt,
  receiptScanError,
} from './types';

/** Minimal views of the existing repositories, so the service is easy to test. */
export interface ScanCategorySource {
  findAll(
    workspaceId: string,
  ): Promise<Array<{ id?: string; name: string; type: 'income' | 'expense' | 'all' }>>;
}

export interface ScanAccountSource {
  findByWorkspaceId(
    workspaceId: string,
  ): Promise<Array<{ id: string; name: string; currency: string; lastActivity?: Date }>>;
}

export interface ReceiptScanUsage {
  used: number;
  /** null = unlimited */
  limit: number | null;
  /** Start of next month (UTC), ISO string. */
  resetsAt: string;
}

export type ReceiptScanWarningCode =
  | 'LOW_CONFIDENCE_TOTAL'
  | 'LOW_CONFIDENCE_DATE'
  | 'LOW_CONFIDENCE_MERCHANT'
  | 'DATE_MISSING'
  | 'DATE_IN_FUTURE'
  | 'CURRENCY_ASSUMED'
  | 'CURRENCY_MISMATCH'
  | 'NO_ACCOUNTS';

export interface ReceiptScanWarning {
  code: ReceiptScanWarningCode;
  field?: 'total' | 'date' | 'merchant' | 'currency' | 'accountId';
  message: string;
}

export interface ReceiptScanResult {
  merchant: string | null;
  total: number;
  currency: string;
  date: string | null;
  subtotal: number | null;
  tax: number | null;
  lineItems: Array<{ description: string; amount: number | null }>;
  categoryId: string | null;
  categoryName: string | null;
  suggestedAccountId: string | null;
  confidence: { total: number | null; date: number | null; merchant: number | null };
  warnings: ReceiptScanWarning[];
  usage: ReceiptScanUsage;
}

export interface ReceiptScanInput {
  workspaceId: string;
  userId: string;
  image: Buffer;
  mimeType: ReceiptImageMimeType;
}

export interface ReceiptScanServiceDeps {
  extractor: ReceiptExtractor | null;
  repository: IReceiptScanRepository;
  categories: ScanCategorySource;
  accounts: ScanAccountSource;
  freeScansPerMonth: number;
  now?: () => Date;
}

/** Below this, the apps flag the field ("Couldn't read the date clearly"). */
export const LOW_CONFIDENCE = 0.6;

/**
 * Words a model might answer with, grouped by meaning. When its category isn't
 * an exact name from the list, the group lets "Fuel" land on "Transportation".
 */
const CATEGORY_SYNONYMS: string[][] = [
  // Default workspaces have no Groceries: fall back to Food & Dining.
  ['groceries', 'grocery', 'supermarket', 'food and groceries', 'food and dining'],
  ['food and dining', 'dining', 'restaurant', 'restaurants', 'eating out', 'dining out', 'food'],
  ['coffee', 'cafe', 'coffee shop', 'coffee shops', 'food and dining'],
  ['transportation', 'transport', 'fuel', 'gas', 'petrol', 'auto and transport', 'car', 'parking'],
  ['health', 'health and fitness', 'healthcare', 'medical', 'pharmacy', 'fitness'],
  ['bills and utilities', 'utilities', 'bills', 'phone', 'internet'],
  ['shopping', 'retail', 'clothing', 'electronics'],
  ['entertainment', 'movies', 'games', 'events'],
  ['travel', 'hotel', 'lodging', 'flights', 'airfare'],
  ['home and garden', 'home', 'hardware', 'household'],
  ['personal care', 'beauty', 'salon', 'haircut'],
];

const normalise = (name: string) =>
  name
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

export const matchCategory = <C extends { id?: string; name: string }>(
  chosen: string | null,
  categories: C[],
): C | null => {
  if (!chosen) return null;
  const lower = chosen.trim().toLowerCase();
  const exact = categories.find((c) => c.name.trim().toLowerCase() === lower);
  if (exact) return exact;

  const key = normalise(chosen);
  const loose = categories.find((c) => normalise(c.name) === key);
  if (loose) return loose;

  const group = CATEGORY_SYNONYMS.find((g) => g.includes(key));
  if (!group) return null;
  // Prefer the group's first (canonical) word, then any other member.
  for (const word of group) {
    const hit = categories.find((c) => normalise(c.name) === word);
    if (hit) return hit;
  }
  return null;
};

export const minorUnitsOf = (currency: string): number => {
  try {
    return (
      new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions()
        .maximumFractionDigits ?? 2
    );
  } catch {
    return 2;
  }
};

export const roundToMinor = (amount: number, currency: string): number => {
  const factor = 10 ** minorUnitsOf(currency);
  return Math.round((amount + Number.EPSILON) * factor) / factor;
};

const isValidCurrency = (code: string) => {
  if (!/^[A-Z]{3}$/.test(code)) return false;
  try {
    new Intl.NumberFormat('en', { style: 'currency', currency: code });
    return true;
  } catch {
    return false;
  }
};

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

const isValidIsoDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && isoDay(d) === value;
};

export const monthStartUtc = (now: Date) =>
  new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
export const nextMonthStartUtc = (now: Date) =>
  new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));

/**
 * Wraps a `ReceiptExtractor`: gives the model the workspace's category names,
 * maps its answer back onto the workspace (category id, suggested account,
 * currency rounding, date sanity, warnings) and records every provider call in
 * `receipt_scans`. Only successful scans count toward the monthly allowance.
 */
export class ReceiptScanService {
  private readonly now: () => Date;

  constructor(private readonly deps: ReceiptScanServiceDeps) {
    this.now = deps.now ?? (() => new Date());
  }

  get isAvailable(): boolean {
    return this.deps.extractor !== null;
  }

  /** The workspace owner's allowance: Free 5/month (configurable), paid unlimited. */
  async getUsage(workspaceId: string): Promise<ReceiptScanUsage> {
    const now = this.now();
    const resetsAt = nextMonthStartUtc(now).toISOString();
    const allowance = await this.deps.repository.findAllowance(workspaceId);
    if (!allowance) return { used: 0, limit: 0, resetsAt };

    const used = await this.deps.repository.countSuccessfulForOwnerSince(
      allowance.ownerId,
      monthStartUtc(now),
    );
    return { used, limit: this.resolveLimit(allowance), resetsAt };
  }

  private resolveLimit(allowance: {
    hasSubscription: boolean;
    planName: string | null;
    snapshotLimit: number | null | undefined;
    planLimit: number | null | undefined;
  }): number | null {
    const stored =
      allowance.snapshotLimit !== undefined ? allowance.snapshotLimit : allowance.planLimit;
    if (typeof stored === 'number') return stored < 0 ? null : stored;
    if (stored === null) return null;
    // Nothing stored (no subscription, or a plan from before migration 032).
    const isFree =
      !allowance.hasSubscription || (allowance.planName ?? '').toLowerCase() === 'free';
    return isFree ? this.deps.freeScansPerMonth : null;
  }

  async scan(input: ReceiptScanInput): Promise<ReceiptScanResult> {
    const extractor = this.deps.extractor;
    if (!extractor) throw receiptScanError('AI_UNAVAILABLE', 503);

    const [categories, accounts] = await Promise.all([
      this.deps.categories.findAll(input.workspaceId),
      this.deps.accounts.findByWorkspaceId(input.workspaceId),
    ]);
    const expenseCategories = categories.filter((c) => c.type !== 'income' && c.id);
    const byActivity = [...accounts].sort(
      (a, b) => (b.lastActivity?.getTime() ?? 0) - (a.lastActivity?.getTime() ?? 0),
    );
    const currencyHint = byActivity[0]?.currency?.toUpperCase() || 'USD';
    const today = isoDay(this.now());

    const started = Date.now();
    let raw: RawReceipt;
    let usage = { inputTokens: null as number | null, outputTokens: null as number | null };
    try {
      const result = await extractor.extract({
        image: input.image,
        mimeType: input.mimeType,
        categories: expenseCategories.map((c) => c.name),
        currencyHint,
        today,
      });
      raw = result.receipt;
      usage = result.usage;
    } catch (error) {
      const outcome: ReceiptScanOutcome =
        error instanceof ReceiptScanError
          ? error.code === 'UNREADABLE'
            ? 'unreadable'
            : 'ai_unavailable'
          : 'error';
      await this.record(
        input,
        outcome,
        started,
        error instanceof ReceiptScanError ? error.usage : undefined,
      );
      throw error instanceof ReceiptScanError ? error : receiptScanError('AI_UNAVAILABLE', 503);
    }

    if (!raw.isReceipt) {
      await this.record(input, 'not_receipt', started, usage);
      throw receiptScanError('NOT_A_RECEIPT', 422, usage);
    }

    const warnings: ReceiptScanWarning[] = [];

    let currency = (raw.currency ?? '').trim().toUpperCase();
    if (!isValidCurrency(currency)) {
      currency = currencyHint;
      warnings.push({
        code: 'CURRENCY_ASSUMED',
        field: 'currency',
        message: `Couldn't read the currency, so ${currency} was assumed.`,
      });
    }

    const total = raw.total === null ? null : roundToMinor(Math.abs(raw.total), currency);
    if (total === null || total <= 0 || raw.total === null || raw.total <= 0) {
      await this.record(input, 'unreadable', started, usage);
      throw receiptScanError('UNREADABLE', 422, usage);
    }

    let date: string | null = raw.date && isValidIsoDate(raw.date.trim()) ? raw.date.trim() : null;
    if (!date) {
      warnings.push({ code: 'DATE_MISSING', field: 'date', message: "Couldn't read the date." });
    } else {
      // A day of slack for users ahead of UTC.
      const latest = isoDay(new Date(this.now().getTime() + 24 * 3600 * 1000));
      if (date > latest) {
        warnings.push({
          code: 'DATE_IN_FUTURE',
          field: 'date',
          message: `The receipt date (${date}) is in the future, so today was used.`,
        });
        date = today;
      }
    }

    const low = (value: number | null) => value !== null && value < LOW_CONFIDENCE;
    if (low(raw.confidence.total)) {
      warnings.push({
        code: 'LOW_CONFIDENCE_TOTAL',
        field: 'total',
        message: "Couldn't read the total clearly.",
      });
    }
    if (date && low(raw.confidence.date)) {
      warnings.push({
        code: 'LOW_CONFIDENCE_DATE',
        field: 'date',
        message: "Couldn't read the date clearly.",
      });
    }
    if (raw.merchant && low(raw.confidence.merchant)) {
      warnings.push({
        code: 'LOW_CONFIDENCE_MERCHANT',
        field: 'merchant',
        message: "Couldn't read the merchant clearly.",
      });
    }

    const category = matchCategory(raw.category, expenseCategories);

    let suggestedAccountId: string | null = null;
    const sameCurrency = byActivity.find((a) => a.currency?.toUpperCase() === currency);
    if (sameCurrency) {
      suggestedAccountId = sameCurrency.id;
    } else if (byActivity[0]) {
      suggestedAccountId = byActivity[0].id;
      warnings.push({
        code: 'CURRENCY_MISMATCH',
        field: 'accountId',
        message: `The receipt is in ${currency} but ${byActivity[0].name} is in ${byActivity[0].currency}. Check the amount before saving.`,
      });
    } else {
      warnings.push({
        code: 'NO_ACCOUNTS',
        field: 'accountId',
        message: 'Add an account to save this transaction.',
      });
    }

    const round = (value: number | null) => (value === null ? null : roundToMinor(value, currency));

    await this.record(input, 'success', started, usage);
    const usageNow = await this.getUsage(input.workspaceId);

    return {
      merchant: raw.merchant,
      total,
      currency,
      date,
      subtotal: round(raw.subtotal),
      tax: round(raw.tax),
      lineItems: raw.lineItems.map((item) => ({
        description: item.description,
        amount: round(item.amount),
      })),
      categoryId: category?.id ?? null,
      categoryName: category?.name ?? null,
      suggestedAccountId,
      confidence: raw.confidence,
      warnings,
      usage: usageNow,
    };
  }

  /** One log row and one log line per provider call: outcome, latency and tokens only. */
  private async record(
    input: ReceiptScanInput,
    outcome: ReceiptScanOutcome,
    started: number,
    usage?: { inputTokens: number | null; outputTokens: number | null },
  ) {
    const latencyMs = Date.now() - started;
    const extractor = this.deps.extractor;
    console.info(
      `[ReceiptScan] outcome=${outcome} latencyMs=${latencyMs} inputTokens=${usage?.inputTokens ?? '-'} outputTokens=${usage?.outputTokens ?? '-'} model=${extractor?.model ?? '-'}`,
    );
    try {
      await this.deps.repository.record({
        workspaceId: input.workspaceId,
        userId: input.userId,
        outcome,
        provider: extractor?.provider ?? null,
        model: extractor?.model ?? null,
        latencyMs,
        inputTokens: usage?.inputTokens ?? null,
        outputTokens: usage?.outputTokens ?? null,
      });
    } catch (error) {
      // Never fail a scan because the log insert failed.
      console.error('[ReceiptScan] could not record the scan', (error as Error)?.message);
    }
  }
}
