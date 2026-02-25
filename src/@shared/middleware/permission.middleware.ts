import { Request, Response, NextFunction } from 'express';
import { Container } from '@di/Container';
import { TOKENS } from '@di/tokens';
import { WorkspaceRequestRepository } from '@domains/workspaces/repositories/WorkspaceRequestRepository';

/**
 * Middleware to require a specific permission for a workspace action.
 * Assumes :id in req.params is the workspaceId.
 */
export const requirePermission = (permission: string) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    const userId = (req as any).user?.userId || (req as any).user?.sub;
    const workspaceId = req.params.id;

    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    if (!workspaceId) {
      return res.status(400).json({ message: 'Workspace ID is required for this action' });
    }

    try {
      // We need an instance of WorkspaceRequestRepository.
      // In a real scenario, we might want to inject this or use a shared instance to avoid multiple connections.
      // For now, we resolve it from the controller factory or create a new one.
      const container = Container.getInstance();
      // Try to get a shared instance if registered, otherwise create one.
      // Note: WorkspaceRequestRepository is currently not strictly a token-based service in DI,
      // but we can resolve it if it was registered.
      const workspaceRepo = new WorkspaceRequestRepository();

      const hasPermission = await workspaceRepo.checkPermission(workspaceId, userId, permission);

      if (!hasPermission) {
        return res.status(403).json({ message: `Forbidden: Missing permission ${permission}` });
      }

      return next();
    } catch (error: any) {
      return res
        .status(500)
        .json({ message: 'Internal server error during permission check', error: error.message });
    }
  };
};
