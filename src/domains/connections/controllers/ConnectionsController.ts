import { Request, Response } from 'express';
import { AppError } from '@shared/errors/AppError';
import type { ConnectionService } from '../services/ConnectionService';
import { ConnectionError } from '../services/ConnectionService';
import { ConnectionSyncError } from '../services/ConnectionSyncService';

const userIdOf = (req: Request): string => {
  const user = (req as any).user;
  return user?.userId || user?.sub;
};

const flag = (value: unknown) => value === 'true' || value === '1' || value === true;

/** Answers `{ data }`, errors as `{ message, code, ...extra }` so the apps can branch on `code`. */
export class ConnectionsController {
  constructor(private readonly getService: () => Promise<ConnectionService>) {}

  private fail(res: Response, error: unknown) {
    if (error instanceof ConnectionError) {
      res
        .status(error.statusCode)
        .json({ message: error.message, code: error.code, ...error.extra });
      return;
    }
    if (error instanceof ConnectionSyncError) {
      res.status(error.statusCode).json({ message: error.message, code: error.code });
      return;
    }
    if (error instanceof AppError) {
      const code = (error as any).code;
      res.status(error.statusCode).json({ message: error.message, ...(code ? { code } : {}) });
      return;
    }
    console.error('[Connections] unexpected error', (error as Error)?.message);
    res.status(500).json({ message: 'Something went wrong.', code: 'UNKNOWN' });
  }

  private async run(
    res: Response,
    status: number,
    work: (service: ConnectionService) => Promise<unknown>,
  ) {
    try {
      const service = await this.getService();
      const data = await work(service);
      res.setHeader('Cache-Control', 'no-store');
      if (status === 204) res.status(204).end();
      else res.status(status).json({ data });
    } catch (error) {
      this.fail(res, error);
    }
  }

  providers = (_req: Request, res: Response) => this.run(res, 200, async (s) => s.listProviders());

  list = (req: Request, res: Response) => this.run(res, 200, (s) => s.list(req.params.workspaceId));

  create = (req: Request, res: Response) =>
    this.run(res, 201, (s) => s.create(req.params.workspaceId, userIdOf(req), req.body));

  oauthStart = (req: Request, res: Response) =>
    this.run(res, 200, (s) =>
      s.oauthStart(req.params.workspaceId, userIdOf(req), req.params.provider, req.body ?? {}),
    );

  oauthComplete = (req: Request, res: Response) =>
    this.run(res, 201, (s) =>
      s.oauthComplete(req.params.workspaceId, userIdOf(req), req.params.provider, req.body),
    );

  assets = (req: Request, res: Response) =>
    this.run(res, 200, (s) => s.discover(req.params.workspaceId, req.params.id));

  async link(req: Request, res: Response) {
    try {
      const service = await this.getService();
      const result = await service.link(
        req.params.workspaceId,
        userIdOf(req),
        req.params.id,
        req.body.links,
      );
      res.setHeader('Cache-Control', 'no-store');
      res.status(result.pending ? 202 : 200).json({ data: result });
    } catch (error) {
      this.fail(res, error);
    }
  }

  unlink = (req: Request, res: Response) =>
    this.run(res, 200, (s) =>
      s.unlink(
        req.params.workspaceId,
        userIdOf(req),
        req.params.id,
        req.params.linkId,
        flag(req.query.deleteImported),
      ),
    );

  sync = (req: Request, res: Response) =>
    this.run(res, 200, (s) => s.sync(req.params.workspaceId, userIdOf(req), req.params.id));

  remove = (req: Request, res: Response) =>
    this.run(res, 204, (s) =>
      s.remove(
        req.params.workspaceId,
        userIdOf(req),
        req.params.id,
        flag(req.query.deleteImported),
      ),
    );
}
