import { Request, Response } from 'express';
import { SubscriptionController } from '@domains/subscription/controllers/SubscriptionController';

/**
 * GET /subscription/workspace/:workspaceId/current used to call
 * WorkspaceRequestRepository.getById(workspaceId, '') — an empty user id never
 * matches a member, so every request answered 404 "Workspace not found".
 */

const USER_ID = '11111111-1111-4111-8111-111111111111';
const OWNER_ID = '22222222-2222-4222-8222-222222222222';
const WORKSPACE_ID = '33333333-3333-4333-8333-333333333333';

const mockRes = () => {
  const res: Partial<Response> & { statusCode: number; body: any } = {
    statusCode: 200,
    body: undefined,
  };
  res.status = jest.fn((code: number) => {
    res.statusCode = code;
    return res as Response;
  }) as any;
  res.json = jest.fn((body: any) => {
    res.body = body;
    return res as Response;
  }) as any;
  return res;
};

const buildController = (getById: jest.Mock) => {
  const subscriptionRepo = {
    getCurrentSubscription: jest.fn().mockResolvedValue({
      data: {
        planId: 'plan-pro',
        status: 'active',
        startDate: '2026-09-01',
        featuresSnapshot: ['pro'],
        limitsSnapshot: { accounts: -1 },
        paymentProvider: 'paddle',
      },
      error: null,
    }),
    getPlans: jest.fn().mockResolvedValue({ data: [{ id: 'plan-pro', name: 'Pro' }], error: null }),
  };
  const accountRepo = { countByWorkspace: jest.fn().mockResolvedValue({ data: 2 }) };
  const workspaceRepo = {
    getById,
    getWorkspacesByOwner: jest.fn().mockResolvedValue({ data: [{ id: WORKSPACE_ID }] }),
  };
  const controller = new SubscriptionController(
    subscriptionRepo as any,
    accountRepo as any,
    workspaceRepo as any,
  );
  return { controller, subscriptionRepo };
};

const req = (user: Record<string, unknown> | undefined) =>
  ({ params: { workspaceId: WORKSPACE_ID }, user }) as unknown as Request;

describe('SubscriptionController.getWorkspaceSubscription', () => {
  it("looks the workspace up as the caller and returns the owner's plan", async () => {
    const getById = jest.fn().mockResolvedValue({
      data: { id: WORKSPACE_ID, ownerId: OWNER_ID },
      error: null,
      statusCode: 200,
    });
    const { controller, subscriptionRepo } = buildController(getById);
    const res = mockRes();

    await controller.getWorkspaceSubscription(req({ userId: USER_ID }), res as Response);

    expect(getById).toHaveBeenCalledWith(WORKSPACE_ID, USER_ID);
    expect(subscriptionRepo.getCurrentSubscription).toHaveBeenCalledWith(OWNER_ID);
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      ownerId: OWNER_ID,
      workspaceOwnerPlan: 'Pro',
      subscription: { plan: 'pro', status: 'active', paymentProvider: 'paddle' },
    });
  });

  it('answers 403 when the caller is not a member', async () => {
    const getById = jest.fn().mockResolvedValue({
      data: null,
      error: 'Not a member of this workspace',
      statusCode: 403,
    });
    const { controller } = buildController(getById);
    const res = mockRes();

    await controller.getWorkspaceSubscription(req({ userId: USER_ID }), res as Response);

    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ message: 'Not a member of this workspace' });
  });

  it('answers 404 for an unknown workspace', async () => {
    const getById = jest
      .fn()
      .mockResolvedValue({ data: null, error: 'Workspace not found', statusCode: 404 });
    const { controller } = buildController(getById);
    const res = mockRes();

    await controller.getWorkspaceSubscription(req({ userId: USER_ID }), res as Response);

    expect(res.statusCode).toBe(404);
  });

  it('answers 401 without a user', async () => {
    const getById = jest.fn();
    const { controller } = buildController(getById);
    const res = mockRes();

    await controller.getWorkspaceSubscription(req(undefined), res as Response);

    expect(res.statusCode).toBe(401);
    expect(getById).not.toHaveBeenCalled();
  });
});
