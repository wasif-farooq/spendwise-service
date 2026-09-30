import { RequestHandler } from 'express';
import { Container } from '@di/Container';
import { TOKENS } from '@di/tokens';
import type { DatabaseFacade } from '@facades/DatabaseFacade';

/** users.role values that may run operator actions. */
export const ADMIN_ROLES: ReadonlySet<string> = new Set(['SUPER_ADMIN', 'staff']);

const roleFromDb = async (userId: string): Promise<string | null> => {
  const db = Container.getInstance().resolve<DatabaseFacade>(TOKENS.Database);
  const result = await db.query('SELECT role FROM users WHERE id = $1', [userId]);
  return result.rows[0]?.role ?? null;
};

/**
 * 403 FORBIDDEN unless the signed-in user's role is an admin role. Runs after
 * requireAuth. The role is read from the database (tokens don't carry it), so
 * a demotion applies at once. A failed lookup is a 403.
 */
export const requireAdmin =
  (lookupRole: (userId: string) => Promise<string | null> = roleFromDb): RequestHandler =>
  async (req, res, next) => {
    const user = (req as any).user;
    const userId: string | undefined = user?.userId || user?.sub;
    let role: string | null = null;
    try {
      role = userId ? await lookupRole(userId) : null;
    } catch {
      role = null;
    }
    if (!role || !ADMIN_ROLES.has(role)) {
      res.status(403).json({ message: 'Only administrators can do this.', code: 'FORBIDDEN' });
      return;
    }
    next();
  };
