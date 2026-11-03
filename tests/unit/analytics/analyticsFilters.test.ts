import { AnalyticsController } from '@domains/analytics/controllers/AnalyticsController';
import { accountAccessFor } from '@domains/workspaces/services/AccountAccess';

jest.mock('@domains/workspaces/services/AccountAccess', () => ({
  accountAccessFor: jest.fn(),
}));

const A1 = '11111111-1111-4111-8111-111111111111';
const A2 = '22222222-2222-4222-8222-222222222222';
const A3 = '33333333-3333-4333-8333-333333333333';
const C1 = '44444444-4444-4444-8444-444444444444';

/** `viewable` undefined = unrestricted (owner / `*`), as AccountAccess reports it. */
const access = (viewable: string[] | undefined) =>
  (accountAccessFor as jest.Mock).mockResolvedValue({ accountIdsWith: () => viewable });

const run = async (query: Record<string, unknown>) => {
  const repo = { getOverview: jest.fn().mockResolvedValue({ data: {} }) };
  const controller = new AnalyticsController(repo as any);
  const req = { params: { workspaceId: 'w1' }, query, user: { userId: 'u1' } } as any;
  const res = { json: jest.fn(), status: jest.fn().mockReturnThis() } as any;
  await controller.getOverview(req, res);
  expect(res.status).not.toHaveBeenCalled();
  return repo.getOverview.mock.calls[0][2];
};

describe('analytics account / category filters', () => {
  it('passes the caller’s account and category filters through (unrestricted)', async () => {
    access(undefined);
    const f = await run({ accounts: [A1, A2], categories: C1 });
    expect(f.accounts).toEqual([A1, A2]);
    expect(f.categories).toEqual([C1]);
  });

  it('accepts a comma-separated list, as URLSearchParams serialises arrays', async () => {
    access(undefined);
    const f = await run({ accounts: `${A1},${A2}` });
    expect(f.accounts).toEqual([A1, A2]);
  });

  it('applies no account filter when none is asked for and the caller is unrestricted', async () => {
    access(undefined);
    const f = await run({});
    expect(f.accounts).toBeUndefined();
    expect(f.categories).toBeUndefined();
  });

  it('defaults a restricted member to their viewable accounts', async () => {
    access([A1, A2]);
    const f = await run({});
    expect(f.accounts).toEqual([A1, A2]);
  });

  it('narrows a restricted member’s filter to accounts they can view', async () => {
    access([A1, A2]);
    const f = await run({ accounts: [A2, A3] });
    expect(f.accounts).toEqual([A2]);
  });

  it('matches nothing when the filter names only hidden accounts', async () => {
    access([A1]);
    const f = await run({ accounts: A3 });
    expect(f.accounts).toEqual([]);
  });

  it('drops ids that are not UUIDs', async () => {
    access(undefined);
    const f = await run({ accounts: ['nope', A1], categories: "x'; drop" });
    expect(f.accounts).toEqual([A1]);
    expect(f.categories).toBeUndefined();
  });
});
