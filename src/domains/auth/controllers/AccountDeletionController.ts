import { Request, Response } from 'express';
import { AppError } from '@shared/errors/AppError';
import { AccountDeletionError, AccountDeletionService } from '../services/AccountDeletionService';

/**
 * Errors are answered here rather than by the global error middleware so the body can
 * carry `code` (and `workspaces` for 409): `{ message, code, workspaces? }`.
 */
export class AccountDeletionController {
  constructor(private readonly getService: () => Promise<AccountDeletionService>) {}

  private userIdOf(req: Request): string {
    const user = (req as any).user;
    const userId = user?.userId || user?.sub;
    if (!userId) throw new AppError('Unauthorized', 401);
    return userId;
  }

  private fail(res: Response, error: unknown) {
    if (error instanceof AccountDeletionError) {
      res.status(error.statusCode).json({
        message: error.message,
        code: error.code,
        ...(error.workspaces ? { workspaces: error.workspaces } : {}),
      });
      return;
    }
    if (error instanceof AppError) {
      res.status(error.statusCode).json({ message: error.message });
      return;
    }
    console.error('[AccountDeletion] unexpected error', error);
    res.status(500).json({ message: 'Could not delete the account. Nothing was deleted.' });
  }

  async preview(req: Request, res: Response) {
    try {
      const userId = this.userIdOf(req);
      const service = await this.getService();
      res.setHeader('Cache-Control', 'no-store');
      res.json({ data: await service.preview(userId) });
    } catch (error) {
      this.fail(res, error);
    }
  }

  async deleteAccount(req: Request, res: Response) {
    try {
      const userId = this.userIdOf(req);
      const service = await this.getService();
      const result = await service.deleteAccount(userId, req.body ?? {});
      res.json({ data: result });
    } catch (error) {
      this.fail(res, error);
    }
  }
}
