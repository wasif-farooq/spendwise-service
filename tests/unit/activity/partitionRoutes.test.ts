import express from 'express';
import request from 'supertest';

let role: string | null = 'user';

jest.mock('@database/factories/PostgresFactory', () => ({ PostgresFactory: jest.fn() }));
jest.mock('@facades/DatabaseFacade', () => ({ DatabaseFacade: jest.fn() }));
jest.mock('@shared/middleware/auth.middleware', () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { userId: 'u1' };
    next();
  },
}));
jest.mock('@di/Container', () => ({
  Container: {
    getInstance: () => ({
      resolve: () => ({ query: async () => ({ rows: role ? [{ role }] : [] }) }),
    }),
  },
}));
jest.mock('@domains/activity/controllers/ActivityLogController', () => ({
  ActivityLogController: jest.fn().mockImplementation(() => {
    const ok = (_req: any, res: any) => res.json({ ok: true });
    return { getActivities: ok, getEntityHistory: ok, listPartitions: ok, ensurePartitions: ok };
  }),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const router = require('@domains/activity/routes/activity.routes').default;
const app = express().use(router);

describe('activity partition maintenance routes', () => {
  it.each([
    ['get', '/activity/partitions'],
    ['post', '/activity/partitions/ensure'],
  ])('%s %s is 403 for a regular user', async (method, path) => {
    role = 'user';
    const res = await (request(app) as any)[method](path);
    expect(res.status).toBe(403);
  });

  it.each([
    ['get', '/activity/partitions'],
    ['post', '/activity/partitions/ensure'],
  ])('%s %s works for an admin', async (method, path) => {
    role = 'SUPER_ADMIN';
    const res = await (request(app) as any)[method](path);
    expect(res.status).toBe(200);
  });
});
