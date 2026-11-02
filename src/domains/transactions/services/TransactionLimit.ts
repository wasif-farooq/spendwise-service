import { AppError } from '@shared/errors/AppError';

/**
 * Monthly transaction allowance (`limits.transactions`): Free 300, Starter 1,000,
 * Pro/Business -1 (unlimited), per calendar month (UTC).
 *
 * - Scope: per workspace, on the workspace owner's plan, the same way the
 *   `accounts` limit is enforced (AccountController counts the workspace's
 *   accounts against the owner's subscription).
 * - What counts: rows people add (`source = 'manual'`: single create, both rows
 *   of a transfer, the opening balance written with a new account), by
 *   `created_at`, so back-dating a transaction doesn't dodge the limit. Rows
 *   written by connected-account sync (`source = 'sync'`, including "Opening
 *   balance (synced)") and its drift adjustments (`source = 'adjustment'`) are
 *   neither counted nor blocked: background sync must never fail half-way.
 * - Transactions are hard-deleted, so deleting one frees its slot.
 */

/** Used when nothing is stored for the owner (no subscription, or a plan without the key). */
export const FREE_TRANSACTIONS_PER_MONTH = 300;

export const TRANSACTION_LIMIT_CODE = 'TRANSACTION_LIMIT_REACHED';

export const monthStartUtc = (now: Date) =>
  new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
export const nextMonthStartUtc = (now: Date) =>
  new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));

export interface TransactionOwnerPlan {
  ownerId: string;
  hasSubscription: boolean;
  /** subscription_plans.name, e.g. "Free", "Starter Monthly". */
  planName: string | null;
  /** The subscription's limits_snapshot over the plan's limits. */
  limits: Record<string, unknown>;
}

export interface TransactionLimitRepository {
  findOwnerPlan(workspaceId: string): Promise<TransactionOwnerPlan | null>;
  /** Rows people added to the workspace (source 'manual') created at or after `since`. */
  countAddedSince(workspaceId: string, since: Date): Promise<number>;
}

export interface TransactionUsage {
  used: number;
  /** null = unlimited. */
  limit: number | null;
  /** First day of next month, UTC (ISO). */
  resetsAt: string;
  /** "Free", "Starter", "Pro", "Business". */
  planName: string;
}

export class TransactionLimitError extends AppError {
  readonly code = TRANSACTION_LIMIT_CODE;

  constructor(
    message: string,
    readonly extra: { feature: 'transactions'; limit: number; used: number; resetsAt: string },
  ) {
    super(message, 402);
  }
}

/** "Starter Monthly" → "Starter"; nothing → "Free". */
export const planDisplayName = (name: string | null | undefined): string => {
  const base = (name ?? '').replace(/\s+(monthly|yearly|annual)$/i, '').trim();
  return base || 'Free';
};

const toLimit = (value: unknown): number | null | undefined => {
  if (value === undefined || value === null || value === '') return undefined;
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return undefined;
  return n < 0 ? null : n;
};

export class TransactionLimitService {
  private readonly now: () => Date;

  constructor(
    private readonly repository: TransactionLimitRepository,
    now?: () => Date,
  ) {
    this.now = now ?? (() => new Date());
  }

  private resolveLimit(plan: TransactionOwnerPlan): number | null {
    const stored = toLimit(plan.limits?.transactions);
    if (stored !== undefined) return stored;
    // Nothing stored: Free (or no subscription) gets the Free allowance, paid plans are open.
    const isFree = !plan.hasSubscription || planDisplayName(plan.planName).toLowerCase() === 'free';
    return isFree ? FREE_TRANSACTIONS_PER_MONTH : null;
  }

  async getUsage(workspaceId: string): Promise<TransactionUsage> {
    const now = this.now();
    const resetsAt = nextMonthStartUtc(now).toISOString();
    const plan = await this.repository.findOwnerPlan(workspaceId);
    if (!plan) {
      return { used: 0, limit: FREE_TRANSACTIONS_PER_MONTH, resetsAt, planName: 'Free' };
    }
    const limit = this.resolveLimit(plan);
    const used = await this.repository.countAddedSince(workspaceId, monthStartUtc(now));
    return { used, limit, resetsAt, planName: planDisplayName(plan.planName) };
  }

  /** Throws 402 TRANSACTION_LIMIT_REACHED when adding `adding` rows would pass the limit. */
  async assertCanAdd(workspaceId: string, adding = 1): Promise<void> {
    const usage = await this.getUsage(workspaceId);
    if (usage.limit === null || usage.used + adding <= usage.limit) return;
    const message =
      usage.used >= usage.limit
        ? `You've added ${usage.limit.toLocaleString('en-US')} transactions this month, the limit on the ${usage.planName} plan. Upgrade to add more.`
        : `A transfer adds 2 transactions and you have ${usage.limit - usage.used} left this month on the ${usage.planName} plan. Upgrade to add more.`;
    throw new TransactionLimitError(message, {
      feature: 'transactions',
      limit: usage.limit,
      used: usage.used,
      resetsAt: usage.resetsAt,
    });
  }
}

interface Queryable {
  query(sql: string, params?: unknown[]): Promise<{ rows: any[] }>;
}

export class SqlTransactionLimitRepository implements TransactionLimitRepository {
  constructor(private readonly db: Queryable) {}

  async findOwnerPlan(workspaceId: string): Promise<TransactionOwnerPlan | null> {
    const result = await this.db.query(
      `SELECT w.owner_id,
              us.id AS subscription_id,
              sp.name AS plan_name,
              COALESCE(sp.limits, '{}'::jsonb) || COALESCE(us.limits_snapshot, '{}'::jsonb) AS limits
         FROM workspaces w
         LEFT JOIN LATERAL (
              SELECT * FROM user_subscriptions
               WHERE user_id = w.owner_id
               ORDER BY created_at DESC
               LIMIT 1
         ) us ON TRUE
         LEFT JOIN subscription_plans sp ON sp.id = us.plan_id
        WHERE w.id = $1`,
      [workspaceId],
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      ownerId: row.owner_id,
      hasSubscription: Boolean(row.subscription_id),
      planName: row.plan_name ?? null,
      limits: row.limits ?? {},
    };
  }

  async countAddedSince(workspaceId: string, since: Date): Promise<number> {
    const result = await this.db.query(
      `SELECT COUNT(*)::int AS count
         FROM transactions
        WHERE workspace_id = $1
          AND source = 'manual'
          AND created_at >= $2`,
      [workspaceId, since],
    );
    return Number(result.rows[0]?.count ?? 0);
  }
}
