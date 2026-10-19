import { DatabaseFacade } from '@facades/DatabaseFacade';
import { planKeyOfName } from './storeProducts';

/** The user's subscription row as the store-billing code sees it. */
export interface SubscriptionRow {
  id: string;
  userId: string;
  planId: string | null;
  /** 'free' | 'starter' | 'pro' | 'business' (from the plan's catalogue name). */
  planKey: string;
  status: string | null;
  paymentProvider: string | null;
  merchantSubscriptionId: string | null;
  billingCycle: string | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  storeProductId: string | null;
  storeOriginalTransactionId: string | null;
  storeManagementUrl: string | null;
  storeEnvironment: string | null;
  storeState: string | null;
  storeLastEventAt: Date | null;
}

export interface PlanRow {
  id: string;
  key: string;
  features: unknown;
  limits: unknown;
}

/** Columns the store code writes (camelCase → snake_case below). */
export interface SubscriptionWrite {
  planId?: string;
  status?: string;
  paymentProvider?: string | null;
  merchantSubscriptionId?: string | null;
  billingCycle?: string | null;
  currentPeriodEnd?: Date | null;
  cancelAtPeriodEnd?: boolean;
  cancelledAt?: Date | null;
  featuresSnapshot?: unknown;
  limitsSnapshot?: unknown;
  storeProductId?: string | null;
  storeOriginalTransactionId?: string | null;
  storeManagementUrl?: string | null;
  storeEnvironment?: string | null;
  storeState?: string | null;
  storeLastEventAt?: Date | null;
}

export interface StorePaymentRecord {
  userId: string;
  subscriptionId: string;
  provider: string;
  transactionId: string;
  /** Minor units, as the payments table stores them. */
  amount: number;
  currency: string;
  description: string;
  metadata: Record<string, unknown>;
}

export interface StoreBillingRepository {
  transaction<T>(fn: (repo: StoreBillingRepository) => Promise<T>): Promise<T>;
  userExists(userId: string): Promise<boolean>;
  /** The user's current (newest) row; locked FOR UPDATE inside a transaction. */
  findCurrent(userId: string): Promise<SubscriptionRow | null>;
  findPlanByKey(key: string): Promise<PlanRow | null>;
  updateSubscription(id: string, write: SubscriptionWrite): Promise<void>;
  createSubscription(userId: string, write: SubscriptionWrite): Promise<string>;
  recordPayment(payment: StorePaymentRecord): Promise<void>;
  markPaymentRefunded(provider: string, transactionId: string): Promise<void>;
  /** Inserts the event id; false when it was already there (a duplicate delivery). */
  claimEvent(event: {
    id: string;
    type: string;
    appUserId: string | null;
    environment: string | null;
  }): Promise<boolean>;
  finishEvent(id: string, outcome: string): Promise<void>;
  releaseEvent(id: string): Promise<void>;
}

const COLUMNS: Record<keyof SubscriptionWrite, string> = {
  planId: 'plan_id',
  status: 'status',
  paymentProvider: 'payment_provider',
  merchantSubscriptionId: 'merchant_subscription_id',
  billingCycle: 'billing_cycle',
  currentPeriodEnd: 'current_period_end',
  cancelAtPeriodEnd: 'cancel_at_period_end',
  cancelledAt: 'cancelled_at',
  featuresSnapshot: 'features_snapshot',
  limitsSnapshot: 'limits_snapshot',
  storeProductId: 'store_product_id',
  storeOriginalTransactionId: 'store_original_transaction_id',
  storeManagementUrl: 'store_management_url',
  storeEnvironment: 'store_environment',
  storeState: 'store_state',
  storeLastEventAt: 'store_last_event_at',
};

const JSON_COLUMNS = new Set(['features_snapshot', 'limits_snapshot']);

function toColumns(write: SubscriptionWrite): { names: string[]; values: unknown[] } {
  const names: string[] = [];
  const values: unknown[] = [];
  for (const [key, value] of Object.entries(write)) {
    if (value === undefined) continue;
    const column = COLUMNS[key as keyof SubscriptionWrite];
    if (!column) continue;
    names.push(column);
    values.push(JSON_COLUMNS.has(column) && value !== null ? JSON.stringify(value) : value);
  }
  return { names, values };
}

const toDate = (value: unknown): Date | null =>
  value ? (value instanceof Date ? value : new Date(String(value))) : null;

export function mapSubscriptionRow(row: any): SubscriptionRow {
  return {
    id: row.id,
    userId: row.user_id,
    planId: row.plan_id ?? null,
    planKey: planKeyOfName(row.plan_name),
    status: row.status ?? null,
    paymentProvider: row.payment_provider ?? null,
    merchantSubscriptionId: row.merchant_subscription_id ?? null,
    billingCycle: row.billing_cycle ?? null,
    currentPeriodEnd: toDate(row.current_period_end),
    cancelAtPeriodEnd: !!row.cancel_at_period_end,
    storeProductId: row.store_product_id ?? null,
    storeOriginalTransactionId: row.store_original_transaction_id ?? null,
    storeManagementUrl: row.store_management_url ?? null,
    storeEnvironment: row.store_environment ?? null,
    storeState: row.store_state ?? null,
    storeLastEventAt: toDate(row.store_last_event_at),
  };
}

/** SQL for the store-billing flows (RevenueCat webhook and sync). */
export class SqlStoreBillingRepository implements StoreBillingRepository {
  constructor(
    private readonly db: DatabaseFacade,
    private readonly inTransaction = false,
  ) {}

  transaction<T>(fn: (repo: StoreBillingRepository) => Promise<T>): Promise<T> {
    if (this.inTransaction) return fn(this);
    return this.db.transaction((trx) => fn(new SqlStoreBillingRepository(trx, true)));
  }

  async userExists(userId: string): Promise<boolean> {
    const result = await this.db.query('SELECT 1 FROM users WHERE id = $1', [userId]);
    return result.rows.length > 0;
  }

  async findCurrent(userId: string): Promise<SubscriptionRow | null> {
    // Lock only the subscription row (FOR UPDATE OF us): plans are shared.
    const lock = this.inTransaction ? 'FOR UPDATE OF us' : '';
    const result = await this.db.query(
      `SELECT us.*, sp.name AS plan_name
         FROM user_subscriptions us
         LEFT JOIN subscription_plans sp ON sp.id = us.plan_id
        WHERE us.user_id = $1
        ORDER BY us.created_at DESC
        LIMIT 1
        ${lock}`,
      [userId],
    );
    return result.rows[0] ? mapSubscriptionRow(result.rows[0]) : null;
  }

  async findPlanByKey(key: string): Promise<PlanRow | null> {
    const result = await this.db.query(
      `SELECT id, name, features, limits FROM subscription_plans
        WHERE is_active IS NOT FALSE AND LOWER(name) LIKE $1
        ORDER BY created_at ASC`,
      [`${key.toLowerCase()}%`],
    );
    const row = result.rows.find((r: any) => planKeyOfName(r.name) === key.toLowerCase());
    return row ? { id: row.id, key, features: row.features, limits: row.limits } : null;
  }

  async updateSubscription(id: string, write: SubscriptionWrite): Promise<void> {
    const { names, values } = toColumns(write);
    if (names.length === 0) return;
    const sets = names.map((name, i) => `${name} = $${i + 2}`);
    await this.db.query(
      `UPDATE user_subscriptions SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $1`,
      [id, ...values],
    );
  }

  async createSubscription(userId: string, write: SubscriptionWrite): Promise<string> {
    const { names, values } = toColumns(write);
    const placeholders = values.map((_, i) => `$${i + 2}`);
    const result = await this.db.query(
      `INSERT INTO user_subscriptions (user_id, start_date, ${names.join(', ')})
       VALUES ($1, NOW(), ${placeholders.join(', ')})
       RETURNING id`,
      [userId, ...values],
    );
    return result.rows[0].id;
  }

  async recordPayment(p: StorePaymentRecord): Promise<void> {
    await this.db.query(
      `INSERT INTO payments (
          user_id, subscription_id, provider, provider_payment_id,
          amount, currency, status, type, description, metadata, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, 'succeeded', 'payment', $7, $8, NOW(), NOW())
       ON CONFLICT (provider, provider_payment_id) DO NOTHING`,
      [
        p.userId,
        p.subscriptionId,
        p.provider,
        p.transactionId,
        p.amount,
        p.currency,
        p.description,
        JSON.stringify(p.metadata),
      ],
    );
  }

  async markPaymentRefunded(provider: string, transactionId: string): Promise<void> {
    await this.db.query(
      `UPDATE payments SET status = 'refunded', updated_at = NOW()
        WHERE provider = $1 AND provider_payment_id = $2`,
      [provider, transactionId],
    );
  }

  async claimEvent(event: {
    id: string;
    type: string;
    appUserId: string | null;
    environment: string | null;
  }): Promise<boolean> {
    const result = await this.db.query(
      `INSERT INTO revenuecat_events (event_id, event_type, app_user_id, environment, outcome)
       VALUES ($1, $2, $3, $4, 'processing')
       ON CONFLICT (event_id) DO NOTHING
       RETURNING event_id`,
      [event.id, event.type, event.appUserId, event.environment],
    );
    return result.rows.length > 0;
  }

  async finishEvent(id: string, outcome: string): Promise<void> {
    await this.db.query('UPDATE revenuecat_events SET outcome = $2 WHERE event_id = $1', [
      id,
      outcome.slice(0, 40),
    ]);
  }

  async releaseEvent(id: string): Promise<void> {
    await this.db.query('DELETE FROM revenuecat_events WHERE event_id = $1', [id]);
  }
}
