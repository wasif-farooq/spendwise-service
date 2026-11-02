import { NextFunction, Request, Response } from 'express';
import { DatabaseFacade } from '@facades/DatabaseFacade';
import { accountAccessFor, AccountPermission } from '@domains/workspaces/services/AccountAccess';
import { PERMISSIONS } from '@domains/workspaces/constants/permissions';

/**
 * Storage routes address a file by its own id (`/storage/:id`), but `requirePermission`
 * reads the workspace from `req.params.workspaceId || req.params.id` — so the file id was
 * taken for a workspace id and every call answered 403. These middlewares put the file's
 * real workspace on `req.params.workspaceId` first, and keep receipts of transactions in
 * accounts the caller can't see invisible (404), as the workspace file list already does.
 */

type Db = Pick<DatabaseFacade, 'query'>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const defaultDb = (): Db =>
  // Resolved lazily so importing this module opens nothing.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require('@di/Container').Container.getInstance().resolve('Database');

const notFound = (res: Response) => res.status(404).json({ error: 'File not found' });

/** `/:id` routes: set `req.params.workspaceId` from the attachment; 404 when there is none. */
export const workspaceFromFile =
  (getDb: () => Db = defaultDb) =>
  async (req: Request, res: Response, next: NextFunction) => {
    const { id } = req.params;
    if (!id || !UUID.test(id)) return notFound(res);
    try {
      const result = await getDb().query('SELECT workspace_id FROM attachments WHERE id = $1', [
        id,
      ]);
      const workspaceId = result.rows[0]?.workspace_id;
      if (!workspaceId) return notFound(res);
      req.params.workspaceId = workspaceId;
      return next();
    } catch (error) {
      console.error('Storage file lookup error:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  };

/** `POST /upload` sends the workspace in the multipart body (parsed by multer first). */
export const workspaceFromBody = () => (req: Request, _res: Response, next: NextFunction) => {
  const workspaceId = (req.body as { workspaceId?: unknown } | undefined)?.workspaceId;
  if (typeof workspaceId === 'string' && workspaceId) req.params.workspaceId = workspaceId;
  next();
};

/**
 * After `requirePermission`: a receipt attached to a transaction in an account the caller
 * can't see is 404; with `linkedPermission`, every linked account must also allow it (403).
 */
export const requireFileAccess =
  (linkedPermission?: AccountPermission, getDb: () => Db = defaultDb) =>
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const db = getDb();
      const access = await accountAccessFor(req, db);
      if (access.unrestricted) return next();
      const result = await db.query(
        'SELECT DISTINCT account_id FROM transactions WHERE workspace_id = $1 AND $2 = ANY(receipt_ids)',
        [req.params.workspaceId, req.params.id],
      );
      const accounts: string[] = result.rows.map((r: { account_id: string }) => r.account_id);
      if (accounts.some((a) => !access.can(a, PERMISSIONS.TRANSACTIONS.VIEW))) return notFound(res);
      if (linkedPermission && accounts.some((a) => !access.can(a, linkedPermission))) {
        return res
          .status(403)
          .json({ error: `You do not have permission: ${linkedPermission} on this account` });
      }
      return next();
    } catch (error) {
      console.error('Storage access check error:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  };
