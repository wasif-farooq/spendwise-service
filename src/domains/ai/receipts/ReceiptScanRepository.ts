import { DatabaseFacade } from '@facades/DatabaseFacade';

export type ReceiptScanOutcome =
  | 'success'
  | 'not_receipt'
  | 'unreadable'
  | 'ai_unavailable'
  | 'error';

export interface ReceiptScanRecord {
  workspaceId: string;
  userId: string | null;
  outcome: ReceiptScanOutcome;
  provider: string | null;
  model: string | null;
  latencyMs: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
}

/** The workspace owner's plan allowance, as stored (-1 / null / missing = see service). */
export interface ReceiptScanAllowanceRow {
  ownerId: string;
  hasSubscription: boolean;
  planName: string | null;
  snapshotLimit: number | null | undefined;
  planLimit: number | null | undefined;
}

export interface IReceiptScanRepository {
  /** Successful scans since `since` in every workspace owned by `ownerId` (the plan is the owner's). */
  countSuccessfulForOwnerSince(ownerId: string, since: Date): Promise<number>;
  findAllowance(workspaceId: string): Promise<ReceiptScanAllowanceRow | null>;
  record(row: ReceiptScanRecord): Promise<void>;
}

const jsonNumber = (value: unknown): number | null | undefined => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
};

export class ReceiptScanRepository implements IReceiptScanRepository {
  constructor(private readonly db: DatabaseFacade) {}

  async countSuccessfulForOwnerSince(ownerId: string, since: Date): Promise<number> {
    const result = await this.db.query(
      `SELECT COUNT(*)::int AS count
         FROM receipt_scans rs
         JOIN workspaces w ON w.id = rs.workspace_id
        WHERE w.owner_id = $1
          AND rs.outcome = 'success'
          AND rs.created_at >= $2`,
      [ownerId, since],
    );
    return Number(result.rows[0]?.count ?? 0);
  }

  async findAllowance(workspaceId: string): Promise<ReceiptScanAllowanceRow | null> {
    const result = await this.db.query(
      `SELECT w.owner_id,
              us.id AS subscription_id,
              sp.name AS plan_name,
              us.limits_snapshot ? 'receiptScansPerMonth' AS has_snapshot_limit,
              us.limits_snapshot->'receiptScansPerMonth' AS snapshot_limit,
              sp.limits ? 'receiptScansPerMonth' AS has_plan_limit,
              sp.limits->'receiptScansPerMonth' AS plan_limit
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
      snapshotLimit: row.has_snapshot_limit ? jsonNumber(row.snapshot_limit) : undefined,
      planLimit: row.has_plan_limit ? jsonNumber(row.plan_limit) : undefined,
    };
  }

  async record(row: ReceiptScanRecord): Promise<void> {
    await this.db.query(
      `INSERT INTO receipt_scans
         (workspace_id, user_id, outcome, provider, model, latency_ms, input_tokens, output_tokens)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        row.workspaceId,
        row.userId,
        row.outcome,
        row.provider,
        row.model,
        row.latencyMs,
        row.inputTokens,
        row.outputTokens,
      ],
    );
  }
}
