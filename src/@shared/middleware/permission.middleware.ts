import { Request, Response, NextFunction } from 'express';
import { Container } from '@di/Container';
import { TOKENS } from '@di/tokens';
import { WorkspaceRequestRepository } from '@domains/workspaces/repositories/WorkspaceRequestRepository';
import { PermissionCache } from '@shared/permissionCache';

/**
 * Middleware to require a specific permission for a workspace action.
 * Uses cached permissions for fast access.
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
            // Try to get from cache first
            let hasPermission = false;
            const cachedPermissions = await PermissionCache.get(userId, workspaceId);

            if (cachedPermissions) {
                // Check from cached permissions
                hasPermission = hasPermissionFromArray(cachedPermissions, permission);
            } else {
                // Cache miss - call the service to calculate and cache
                const workspaceRepo = new WorkspaceRequestRepository();
                hasPermission = await workspaceRepo.checkPermission(workspaceId, userId, permission);
            }

            if (!hasPermission) {
                return res.status(403).json({ message: `Forbidden: Missing permission ${permission}` });
            }

            return next();
        } catch (error: any) {
            console.error('Permission check error:', error);
            // Fail open or closed? Let's fail closed for security
            return res.status(500).json({ message: 'Internal server error during permission check' });
        }
    };
};

/**
 * Check if a permission is granted from a permissions array
 */
function hasPermissionFromArray(permissions: string[], permission: string): boolean {
    // 1. Full Wildcard
    if (permissions.includes('*')) return true;

    // 2. Exact Match
    if (permissions.includes(permission)) return true;

    // 3. Resource Wildcard (e.g. 'members:*' allows 'members:create')
    const parts = permission.split(':');
    if (parts.length > 1) {
        const resourceWildcard = `${parts[0]}:*`;
        if (permissions.includes(resourceWildcard)) return true;
    }

    return false;
}
