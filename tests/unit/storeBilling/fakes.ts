import {
  PlanRow,
  StoreBillingRepository,
  StorePaymentRecord,
  SubscriptionRow,
  SubscriptionWrite,
} from '@domains/store-billing/StoreSubscriptionRepository';
import { RevenueCatEvent } from '@domains/store-billing/storeState';

export const USER_ID = '11111111-1111-4111-8111-111111111111';
export const OTHER_USER_ID = '22222222-2222-4222-8222-222222222222';

export const PLANS: Record<string, PlanRow> = {
  free: { id: 'plan-free', key: 'free', features: ['free'], limits: { accounts: 5 } },
  starter: { id: 'plan-starter', key: 'starter', features: ['starter'], limits: { accounts: 5 } },
  pro: { id: 'plan-pro', key: 'pro', features: ['pro'], limits: { accounts: -1 } },
  business: { id: 'plan-business', key: 'business', features: ['biz'], limits: { accounts: -1 } },
};

const planKeyOfId = (id: string | null | undefined) =>
  Object.values(PLANS).find((p) => p.id === id)?.key ?? 'free';

export interface FakeRow extends SubscriptionRow {
  cancelledAt?: Date | null;
  featuresSnapshot?: unknown;
  limitsSnapshot?: unknown;
}

/** In-memory StoreBillingRepository: one subscription row per user. */
export class FakeStoreRepo implements StoreBillingRepository {
  users = new Set<string>([USER_ID, OTHER_USER_ID]);
  rows = new Map<string, FakeRow>();
  payments: Array<StorePaymentRecord & { status: string }> = [];
  events = new Map<string, string>();
  transactions = 0;

  seed(userId: string, row: Partial<FakeRow>): FakeRow {
    const full: FakeRow = {
      id: `sub-${userId.slice(0, 4)}`,
      userId,
      planId: PLANS.free.id,
      planKey: 'free',
      status: 'active',
      paymentProvider: null,
      merchantSubscriptionId: null,
      billingCycle: 'monthly',
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      storeProductId: null,
      storeOriginalTransactionId: null,
      storeManagementUrl: null,
      storeEnvironment: null,
      storeState: null,
      storeLastEventAt: null,
      ...row,
    };
    full.planKey = planKeyOfId(full.planId);
    this.rows.set(userId, full);
    return full;
  }

  row(userId = USER_ID): FakeRow {
    const row = this.rows.get(userId);
    if (!row) throw new Error(`no row for ${userId}`);
    return row;
  }

  async transaction<T>(fn: (repo: StoreBillingRepository) => Promise<T>): Promise<T> {
    this.transactions += 1;
    return fn(this);
  }
  async userExists(userId: string) {
    return this.users.has(userId);
  }
  async findCurrent(userId: string) {
    const row = this.rows.get(userId);
    return row ? { ...row } : null;
  }
  async findPlanByKey(key: string) {
    return PLANS[key] ?? null;
  }
  private applyWrite(row: FakeRow, write: SubscriptionWrite) {
    for (const [k, v] of Object.entries(write)) {
      if (v !== undefined) (row as any)[k] = v;
    }
    row.planKey = planKeyOfId(row.planId);
  }
  async updateSubscription(id: string, write: SubscriptionWrite) {
    const row = [...this.rows.values()].find((r) => r.id === id);
    if (!row) throw new Error('Entity not found');
    this.applyWrite(row, write);
  }
  async createSubscription(userId: string, write: SubscriptionWrite) {
    const row = this.seed(userId, {});
    this.applyWrite(row, write);
    return row.id;
  }
  async recordPayment(p: StorePaymentRecord) {
    if (this.payments.some((x) => x.provider === p.provider && x.transactionId === p.transactionId))
      return;
    this.payments.push({ ...p, status: 'succeeded' });
  }
  async markPaymentRefunded(provider: string, transactionId: string) {
    for (const p of this.payments)
      if (p.provider === provider && p.transactionId === transactionId) p.status = 'refunded';
  }
  async claimEvent(e: { id: string }) {
    if (this.events.has(e.id)) return false;
    this.events.set(e.id, 'processing');
    return true;
  }
  async finishEvent(id: string, outcome: string) {
    this.events.set(id, outcome);
  }
  async releaseEvent(id: string) {
    this.events.delete(id);
  }
}

export const NOW = new Date('2026-10-19T12:00:00Z');
export const DAY = 24 * 60 * 60 * 1000;

let seq = 0;
export function rcEvent(over: Partial<RevenueCatEvent> = {}): RevenueCatEvent {
  seq += 1;
  return {
    id: `evt-${seq}`,
    type: 'INITIAL_PURCHASE',
    app_user_id: USER_ID,
    original_app_user_id: USER_ID,
    aliases: [USER_ID],
    product_id: 'pro:monthly',
    store: 'PLAY_STORE',
    environment: 'PRODUCTION',
    purchased_at_ms: NOW.getTime() - 1000,
    expiration_at_ms: NOW.getTime() + 30 * DAY,
    event_timestamp_ms: NOW.getTime() - 500,
    transaction_id: `GPA.1111-2222-3333-44444..${seq}`,
    original_transaction_id: 'GPA.1111-2222-3333-44444',
    price: 9.99,
    price_in_purchased_currency: 9.99,
    currency: 'USD',
    ...over,
  };
}
