import { DatabaseFacade } from '@facades/DatabaseFacade';

/** A workspace the user belongs to or owns, with how many other people are in it. */
export interface WorkspaceMembershipRow {
  id: string;
  name: string;
  ownerId: string | null;
  /** Members other than the user. */
  otherMembers: number;
}

/** A stored file that has to be removed from object storage. */
export interface StoredObject {
  bucket: string;
  key: string;
}

/** The user's subscription row, as far as cancelling it is concerned. */
export interface DeletableSubscription {
  id: string;
  status: string | null;
  paymentProvider: string | null;
  merchantSubscriptionId: string | null;
}

export interface DeletedRows {
  workspaces: number;
  memberships: number;
  invitations: number;
  users: number;
}

const toInt = (value: unknown): number => {
  const n = typeof value === 'number' ? value : parseInt(String(value ?? '0'), 10);
  return Number.isFinite(n) ? n : 0;
};

/**
 * SQL for hard-deleting a user (DELETE /auth/account).
 *
 * Every method takes the connection to use, so the service runs them inside one
 * transaction. Most rows go through ON DELETE CASCADE / SET NULL from `users` and
 * `workspaces`; the statements here cover what has no foreign key
 * (activity_logs, transactions_archive, invitations addressed by email).
 */
export class AccountDeletionRepository {
  constructor(private readonly db: DatabaseFacade) {}

  get connection(): DatabaseFacade {
    return this.db;
  }

  /**
   * Workspaces the user owns or is a member of. With `lock`, the workspace rows are
   * locked FOR UPDATE: a concurrent invitation accept (an INSERT into
   * workspace_members, whose FK takes a KEY SHARE lock on the workspace) waits until
   * the deletion commits, so nobody can join a workspace between the check and the delete.
   */
  async findWorkspaces(
    userId: string,
    options: { db?: DatabaseFacade; lock?: boolean } = {},
  ): Promise<WorkspaceMembershipRow[]> {
    const db = options.db ?? this.db;
    const result = await db.query(
      `SELECT w.id, w.name, w.owner_id,
              (SELECT COUNT(*) FROM workspace_members m
                WHERE m.workspace_id = w.id AND m.user_id IS DISTINCT FROM $1) AS other_members
         FROM workspaces w
        WHERE w.owner_id = $1
           OR EXISTS (SELECT 1 FROM workspace_members m
                       WHERE m.workspace_id = w.id AND m.user_id = $1)
        ORDER BY w.created_at ASC, w.name ASC
        ${options.lock ? 'FOR UPDATE OF w' : ''}`,
      [userId],
    );
    return result.rows.map((row: any) => ({
      id: row.id,
      name: row.name,
      ownerId: row.owner_id ?? null,
      otherMembers: toInt(row.other_members),
    }));
  }

  async findSubscriptions(
    userId: string,
    options: { db?: DatabaseFacade } = {},
  ): Promise<DeletableSubscription[]> {
    const db = options.db ?? this.db;
    const result = await db.query(
      `SELECT id, status, payment_provider, merchant_subscription_id
         FROM user_subscriptions
        WHERE user_id = $1`,
      [userId],
    );
    return result.rows.map((row: any) => ({
      id: row.id,
      status: row.status ?? null,
      paymentProvider: row.payment_provider ?? null,
      merchantSubscriptionId: row.merchant_subscription_id ?? null,
    }));
  }

  /** Files (receipts, workspace logos) stored for these workspaces. */
  async findWorkspaceObjects(
    workspaceIds: string[],
    options: { db?: DatabaseFacade } = {},
  ): Promise<StoredObject[]> {
    if (workspaceIds.length === 0) return [];
    const db = options.db ?? this.db;
    const result = await db.query(
      `SELECT bucket, key FROM attachments
        WHERE workspace_id = ANY($1::uuid[]) AND bucket IS NOT NULL AND key IS NOT NULL`,
      [workspaceIds],
    );
    return result.rows.map((row: any) => ({ bucket: row.bucket, key: row.key }));
  }

  /**
   * Deletes the workspaces (only ones this user owns), everything under them, and the
   * user. Runs on the given transaction.
   */
  async deleteUserData(
    db: DatabaseFacade,
    params: { userId: string; email: string; workspaceIds: string[] },
  ): Promise<DeletedRows> {
    const { userId, email, workspaceIds } = params;
    let workspaces = 0;

    if (workspaceIds.length > 0) {
      // No foreign keys on these two, so the workspace cascade does not reach them.
      await db.query('DELETE FROM activity_logs WHERE workspace_id = ANY($1::uuid[])', [
        workspaceIds,
      ]);
      await db.query('DELETE FROM transactions_archive WHERE workspace_id = ANY($1::uuid[])', [
        workspaceIds,
      ]);
      // Cascades to accounts, transactions, categories, roles, members, member
      // permissions, invitations, attachments and report requests / schedules.
      const deleted = await db.query(
        'DELETE FROM workspaces WHERE id = ANY($1::uuid[]) AND owner_id = $2',
        [workspaceIds, userId],
      );
      workspaces = deleted.rowCount ?? 0;
    }

    // In workspaces the user only belonged to, their history stays with the workspace
    // but no longer points at them (and loses the request IP / user agent).
    await db.query(
      `UPDATE activity_logs
          SET user_id = NULL, metadata = COALESCE(metadata, '{}'::jsonb) - 'ip' - 'userAgent'
        WHERE user_id = $1`,
      [userId],
    );
    await db.query('UPDATE transactions_archive SET user_id = NULL WHERE user_id = $1', [userId]);

    // Invitations addressed to this email in other people's workspaces.
    const invitations = await db.query(
      'DELETE FROM workspace_invitations WHERE LOWER(email) = LOWER($1)',
      [email],
    );

    const memberships = await db.query('DELETE FROM workspace_members WHERE user_id = $1', [
      userId,
    ]);

    // Cascades to auth_identities (password hash, Google link), user_preferences,
    // user_subscriptions, push_tokens, report_requests and scheduled_reports; sets
    // user_id NULL on accounts, transactions, attachments, payments and promo code uses
    // in what remains. 2FA secrets, backup codes and the verification code are columns
    // of the row itself.
    const users = await db.query('DELETE FROM users WHERE id = $1', [userId]);

    return {
      workspaces,
      memberships: memberships.rowCount ?? 0,
      invitations: invitations.rowCount ?? 0,
      users: users.rowCount ?? 0,
    };
  }
}
