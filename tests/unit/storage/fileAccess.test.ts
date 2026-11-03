import express from 'express';
import request from 'supertest';
import { requirePermission } from '@shared/middleware/permission.middleware';
import {
  requireFileAccess,
  workspaceFromBody,
  workspaceFromFile,
} from '@domains/storage/middleware/fileAccess';
import { accountAccessFor } from '@domains/workspaces/services/AccountAccess';

const WS = '11111111-1111-4111-8111-111111111111';
const OTHER_WS = '99999999-9999-4999-8999-999999999999';
const FILE = '22222222-2222-4222-8222-222222222222';
const SHARED = '33333333-3333-4333-8333-333333333333';
const HIDDEN = '44444444-4444-4444-8444-444444444444';

// The caller holds storage permissions in WS only, so a check against any other id fails.
jest.mock('@shared/permissionCache', () => ({
  PermissionCache: {
    get: jest.fn(async (_user: string, ws: string) =>
      ws === '11111111-1111-4111-8111-111111111111'
        ? ['storage:view', 'storage:create', 'storage:delete']
        : null,
    ),
    set: jest.fn(),
  },
}));
jest.mock('@di/Container', () => ({
  Container: { getInstance: () => ({ resolve: () => ({ query: async () => ({ rows: [] }) }) }) },
}));
jest.mock('@domains/workspaces/services/AccountAccess', () => ({ accountAccessFor: jest.fn() }));

/** `linked`: accounts of the transactions the file is a receipt of. */
const fakeDb = (linked: string[], fileWorkspace: string | null = WS) => ({
  query: jest.fn(async (sql: string) =>
    sql.includes('FROM attachments')
      ? { rows: fileWorkspace ? [{ workspace_id: fileWorkspace }] : [] }
      : { rows: linked.map((account_id) => ({ account_id })) },
  ),
});

/** `canSee` undefined = unrestricted; otherwise the accounts and the actions allowed there. */
const access = (allowed?: Record<string, string[]>) =>
  (accountAccessFor as jest.Mock).mockResolvedValue({
    unrestricted: !allowed,
    can: (acc: string, perm: string) => !!allowed?.[acc]?.includes(perm),
  });

const app = (db: ReturnType<typeof fakeDb>) => {
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => {
    (req as any).user = { userId: 'u1' };
    next();
  });
  const getDb = () => db;
  const ok = (req: express.Request, res: express.Response) =>
    res.json({ ok: true, workspaceId: req.params.workspaceId });
  a.get(
    '/:id',
    workspaceFromFile(getDb),
    requirePermission('storage:view'),
    requireFileAccess(undefined, getDb),
    ok,
  );
  a.delete(
    '/:id',
    workspaceFromFile(getDb),
    requirePermission('storage:delete'),
    requireFileAccess('transactions:edit', getDb),
    ok,
  );
  a.post('/upload', workspaceFromBody(), requirePermission('storage:create'), ok);
  return a;
};

describe('storage file routes resolve the workspace from the file', () => {
  it('opens a file using the file’s workspace (was 403: the file id was read as the workspace)', async () => {
    access(undefined);
    const res = await request(app(fakeDb([]))).get(`/${FILE}`);
    expect(res.status).toBe(200);
    expect(res.body.workspaceId).toBe(WS);
  });

  it('404s for an unknown file or a non-UUID id', async () => {
    access(undefined);
    expect((await request(app(fakeDb([], null))).get(`/${FILE}`)).status).toBe(404);
    expect((await request(app(fakeDb([]))).get('/not-a-uuid')).status).toBe(404);
  });

  it('403s when the caller has no storage permission in the file’s workspace', async () => {
    access(undefined);
    const res = await request(app(fakeDb([], OTHER_WS))).get(`/${FILE}`);
    expect(res.status).toBe(403);
  });

  it('upload reads the workspace from the body', async () => {
    const res = await request(app(fakeDb([])))
      .post('/upload')
      .send({ workspaceId: WS });
    expect(res.status).toBe(200);
  });
});

describe('receipts follow per-account access', () => {
  it('a restricted member opens a receipt in a shared account', async () => {
    access({ [SHARED]: ['transactions:view'] });
    expect((await request(app(fakeDb([SHARED]))).get(`/${FILE}`)).status).toBe(200);
  });

  it('a receipt in a hidden account is 404', async () => {
    access({ [SHARED]: ['transactions:view'] });
    expect((await request(app(fakeDb([HIDDEN]))).get(`/${FILE}`)).status).toBe(404);
  });

  it('a file not attached to any transaction stays reachable (as in the file list)', async () => {
    access({});
    expect((await request(app(fakeDb([]))).get(`/${FILE}`)).status).toBe(200);
  });

  it('deleting a receipt needs transactions:edit on its account', async () => {
    access({ [SHARED]: ['transactions:view'] });
    expect((await request(app(fakeDb([SHARED]))).delete(`/${FILE}`)).status).toBe(403);
    access({ [SHARED]: ['transactions:view', 'transactions:edit'] });
    expect((await request(app(fakeDb([SHARED]))).delete(`/${FILE}`)).status).toBe(200);
  });
});
