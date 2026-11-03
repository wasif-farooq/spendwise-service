import { WorkspaceController } from '@domains/workspaces/controllers/WorkspaceController';
import { WorkspaceRequestRepository } from '@domains/workspaces/repositories/WorkspaceRequestRepository';

const updateMember = jest.fn();

jest.mock('@config/ConfigLoader', () => ({
  ConfigLoader: { getInstance: () => ({ get: () => 'direct' }) },
}));
jest.mock('@di/Container', () => ({
  Container: { getInstance: () => ({ resolve: () => ({}) }) },
}));
jest.mock('@database/factories/PostgresFactory', () => ({}));
jest.mock('@factories/RepositoryFactory', () => ({ RepositoryFactory: jest.fn() }));
jest.mock('@factories/ServiceFactory', () => ({
  ServiceFactory: jest.fn().mockImplementation(() => ({
    createWorkspaceService: () => ({ updateMember }),
  })),
}));

const WS = '11111111-1111-4111-8111-111111111111';
const MEMBER = '22222222-2222-4222-8222-222222222222';

const run = async (body: unknown) => {
  const controller = new WorkspaceController(new WorkspaceRequestRepository());
  const req = {
    params: { workspaceId: WS, memberId: MEMBER },
    body,
    user: { userId: 'u1' },
  } as any;
  const res = { json: jest.fn(), status: jest.fn().mockReturnThis() } as any;
  await controller.updateMember(req, res);
  return res;
};

describe('PUT /workspaces/:workspaceId/members/:memberId (web member form)', () => {
  beforeEach(() => updateMember.mockReset());

  it('saves the role and account access through WorkspaceService.updateMember', async () => {
    updateMember.mockResolvedValue(undefined);
    const body = {
      role: 'Bookkeeper',
      accountPermissions: { a1: { permissions: ['view'], denied: [] } },
    };
    const res = await run(body);
    expect(updateMember).toHaveBeenCalledWith(WS, 'u1', MEMBER, body);
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalled();
  });

  it('passes an empty access set through so it clears the member’s accounts', async () => {
    updateMember.mockResolvedValue(undefined);
    await run({ role: 'Bookkeeper', accountPermissions: {} });
    expect(updateMember.mock.calls[0][3]).toEqual({ role: 'Bookkeeper', accountPermissions: {} });
  });

  it('returns the service error status', async () => {
    updateMember.mockRejectedValue(
      Object.assign(new Error('Member not found'), { statusCode: 404 }),
    );
    const res = await run({ role: 'Bookkeeper' });
    expect(res.status).toHaveBeenCalledWith(404);
  });
});
