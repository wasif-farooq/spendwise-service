import type { Request } from 'express';
import type { DatabaseFacade } from '@facades/DatabaseFacade';
import { AppError } from '@shared/errors/AppError';
import { PERMISSIONS } from '@domains/workspaces/constants/permissions';

/**
 * Per-account access for workspace members (workspace_member_account_permissions).
 *
 * - The workspace owner, and members whose roles grant `*`, are unrestricted.
 * - Everyone else sees only the accounts they have a row for (no rows: no accounts).
 *   Within such an account an action is allowed when it is not in the row's
 *   `denied_permissions` and it is in the row's `permissions` — or, when the row's
 *   permissions are empty ("Per role"), when the member's roles grant it.
 *
 * The route's workspace-level permission check still applies on top of this.
 *
 * Rows store either full names (`transactions:create`, as copied from a role) or the
 * bare levels the member form writes (`view`, `create`, `edit`), which apply to both
 * `accounts:` and `transactions:`.
 */

export type AccountPermission =
  | 'accounts:view'
  | 'accounts:edit'
  | 'accounts:delete'
  | 'transactions:view'
  | 'transactions:create'
  | 'transactions:edit'
  | 'transactions:delete';

export interface AccountPermissionRow {
  permissions: string[];
  denied: string[];
}

/** What a member gets on an account they create, so they don't lock themselves out. */
export const CREATOR_ACCOUNT_PERMISSIONS: AccountPermission[] = [
  PERMISSIONS.ACCOUNTS.VIEW,
  PERMISSIONS.ACCOUNTS.EDIT,
  PERMISSIONS.ACCOUNTS.DELETE,
  PERMISSIONS.TRANSACTIONS.VIEW,
  PERMISSIONS.TRANSACTIONS.CREATE,
  PERMISSIONS.TRANSACTIONS.EDIT,
  PERMISSIONS.TRANSACTIONS.DELETE,
];

const grants = (list: string[], permission: string): boolean => {
  if (list.includes('*') || list.includes(permission)) return true;
  const [resource, action] = permission.split(':');
  if (!action) return false;
  return list.includes(`${resource}:*`) || list.includes(action);
};

export class AccountAccess {
  private constructor(
    readonly unrestricted: boolean,
    /** The workspace_members.id, when the user is a member. */
    readonly memberId: string | null,
    private readonly rolePermissions: string[],
    private readonly rows: Map<string, AccountPermissionRow>,
  ) {}

  static unrestricted(memberId: string | null = null): AccountAccess {
    return new AccountAccess(true, memberId, ['*'], new Map());
  }

  static restricted(
    memberId: string | null,
    rolePermissions: string[],
    rows: Map<string, AccountPermissionRow> | Record<string, AccountPermissionRow>,
  ): AccountAccess {
    const map = rows instanceof Map ? rows : new Map(Object.entries(rows));
    return new AccountAccess(false, memberId, rolePermissions, map);
  }

  /** Visible: a row exists and does not deny `accounts:view`. */
  canSee(accountId: string | null | undefined): boolean {
    if (this.unrestricted) return true;
    if (!accountId) return false;
    const row = this.rows.get(accountId);
    return !!row && !grants(row.denied, PERMISSIONS.ACCOUNTS.VIEW);
  }

  can(accountId: string | null | undefined, permission: AccountPermission): boolean {
    if (this.unrestricted) return true;
    if (!accountId || !this.canSee(accountId)) return false;
    const row = this.rows.get(accountId)!;
    if (grants(row.denied, permission)) return false;
    if (row.permissions.length > 0) return grants(row.permissions, permission);
    return grants(this.rolePermissions, permission);
  }

  /**
   * Throws 404 when the account is invisible (so its existence is not confirmed)
   * and 403 when it is visible but the action is not allowed.
   */
  assert(
    accountId: string | null | undefined,
    permission: AccountPermission,
    notFoundMessage = 'Account not found',
  ): void {
    if (this.unrestricted) return;
    if (!this.canSee(accountId)) throw new AppError(notFoundMessage, 404);
    if (!this.can(accountId, permission)) {
      throw new AppError(`You do not have permission: ${permission} on this account`, 403);
    }
  }

  /**
   * Account ids to restrict a query to (`account_id = ANY($n)`), or undefined when
   * unrestricted. An empty array means "nothing" — callers must not treat it as "no filter".
   */
  accountIdsWith(permission: AccountPermission = PERMISSIONS.ACCOUNTS.VIEW): string[] | undefined {
    if (this.unrestricted) return undefined;
    return [...this.rows.keys()].filter((id) =>
      permission === PERMISSIONS.ACCOUNTS.VIEW ? this.canSee(id) : this.can(id, permission),
    );
  }
}

/** Resolves a user's account access in a workspace (one to three queries). */
export async function resolveAccountAccess(
  db: Pick<DatabaseFacade, 'query'>,
  userId: string,
  workspaceId: string,
): Promise<AccountAccess> {
  const head = await db.query(
    `SELECT w.owner_id, wm.id AS member_id, wm.role_ids
       FROM workspaces w
       LEFT JOIN workspace_members wm ON wm.workspace_id = w.id AND wm.user_id = $2
      WHERE w.id = $1`,
    [workspaceId, userId],
  );
  const row = head.rows[0];
  if (!row) return AccountAccess.restricted(null, [], new Map());
  const memberId: string | null = row.member_id ?? null;
  if (row.owner_id === userId) return AccountAccess.unrestricted(memberId);
  if (!memberId) return AccountAccess.restricted(null, [], new Map());

  const roleIds: string[] = row.role_ids || [];
  const rolePermissions = new Set<string>();
  if (roleIds.length > 0) {
    const roles = await db.query('SELECT permissions FROM workspace_roles WHERE id = ANY($1)', [
      roleIds,
    ]);
    for (const role of roles.rows) {
      for (const perm of role.permissions || []) rolePermissions.add(perm);
    }
  }
  if (rolePermissions.has('*')) return AccountAccess.unrestricted(memberId);

  // Joined to accounts so a row can never reach into another workspace.
  const rows = await db.query(
    `SELECT p.account_id, p.permissions, p.denied_permissions
       FROM workspace_member_account_permissions p
       JOIN accounts a ON a.id = p.account_id
      WHERE p.member_id = $1 AND a.workspace_id = $2`,
    [memberId, workspaceId],
  );
  const map = new Map<string, AccountPermissionRow>();
  for (const r of rows.rows) {
    map.set(r.account_id, {
      permissions: r.permissions || [],
      denied: r.denied_permissions || [],
    });
  }
  return AccountAccess.restricted(memberId, [...rolePermissions], map);
}

/**
 * Gives the creator of an account full rights on it. A no-op for unrestricted users
 * (they see everything anyway) and when the row already exists.
 */
export async function grantCreatorAccess(
  db: Pick<DatabaseFacade, 'query'>,
  access: AccountAccess | undefined,
  accountId: string,
): Promise<void> {
  if (!access || access.unrestricted || !access.memberId) return;
  await db.query(
    `INSERT INTO workspace_member_account_permissions
            (member_id, account_id, permissions, denied_permissions, created_at, updated_at)
     VALUES ($1, $2, $3, '{}', NOW(), NOW())
     ON CONFLICT (member_id, account_id) DO NOTHING`,
    [access.memberId, accountId, CREATOR_ACCOUNT_PERMISSIONS],
  );
}

const REQUEST_KEY = Symbol.for('trackmypocket.accountAccess');

/**
 * The caller's access for `req.params.workspaceId`, resolved once per request.
 * Nothing is cached across requests, so changes to rows or roles apply on the next call.
 */
export function accountAccessFor(
  req: Request,
  db?: Pick<DatabaseFacade, 'query'>,
): Promise<AccountAccess> {
  const user = (req as any).user;
  const userId: string | undefined = user?.userId || user?.id || user?.sub;
  const workspaceId: string | undefined = req.params?.workspaceId;
  const cache: Map<string, Promise<AccountAccess>> = (req as any)[REQUEST_KEY] ||
  ((req as any)[REQUEST_KEY] = new Map());
  const key = `${userId}:${workspaceId}`;
  let pending = cache.get(key);
  if (!pending) {
    if (!userId || !workspaceId) {
      pending = Promise.resolve(AccountAccess.restricted(null, [], new Map()));
    } else {
      const database =
        db ??
        // Resolved lazily so importing this module opens nothing.
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        require('@di/Container').Container.getInstance().resolve(
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          require('@di/tokens').TOKENS.Database,
        );
      pending = resolveAccountAccess(database, userId, workspaceId);
    }
    cache.set(key, pending);
    pending.catch(() => cache.delete(key));
  }
  return pending;
}
