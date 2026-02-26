import { Request, Response, NextFunction } from 'express';
import { Container } from '@di/Container';
import { DatabaseFacade } from '@facades/DatabaseFacade';
import { PermissionCache } from '@shared/permissionCache';

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

/**
 * Get permissions directly from database (fast, no RPC)
 */
async function getPermissionsFromDB(db: DatabaseFacade, userId: string, workspaceId: string): Promise<string[]> {
    try {
        // Get workspace to check if user is owner
        const workspaceResult = await db.query(
            'SELECT owner_id FROM workspaces WHERE id = $1',
            [workspaceId]
        );
        
        if (workspaceResult.rows[0]?.owner_id === userId) {
            return ['*']; // Owner has all permissions
        }

        // Get member's roles
        const memberResult = await db.query(
            'SELECT role_ids FROM workspace_members WHERE user_id = $1 AND workspace_id = $2',
            [userId, workspaceId]
        );

        if (!memberResult.rows[0]) {
            return [];
        }

        const roleIds = memberResult.rows[0].role_ids || [];
        if (roleIds.length === 0) {
            return [];
        }

        // Get role permissions
        const rolesResult = await db.query(
            'SELECT permissions FROM workspace_roles WHERE id = ANY($1)',
            [roleIds]
        );

        // Collect all permissions
        const permissionSet = new Set<string>();
        for (const role of rolesResult.rows) {
            const perms = role.permissions || [];
            for (const perm of perms) {
                if (perm === '*') {
                    return ['*']; // Full wildcard
                }
                permissionSet.add(perm);
            }
        }

        return Array.from(permissionSet);
    } catch (error) {
        console.error('Error getting permissions from DB:', error);
        return [];
    }
}

/**
 * Middleware to require a specific permission for a workspace action.
 * Uses cached permissions for fast access, with direct DB query on cache miss.
 */
export const requirePermission = (permission: string) => {
    return async (req: Request, res: Response, next: NextFunction) => {
        const userId = (req as any).user?.userId || (req as any).user?.sub;
        // Check multiple param names for workspace ID
        const workspaceId = req.params.id || req.params.orgId || req.params.workspaceId;

        if (!userId) {
            return res.status(401).json({ message: 'Unauthorized' });
        }

        if (!workspaceId) {
            return res.status(400).json({ message: 'Workspace ID is required for this action' });
        }

        try {
            // Try to get from cache first
            const cachedPermissions = await PermissionCache.get(userId, workspaceId);

            let hasPermission = false;

            if (cachedPermissions) {
                // Check from cached permissions
                hasPermission = hasPermissionFromArray(cachedPermissions, permission);
            } else {
                // Cache miss - query DB directly (fast, no RPC)
                const db = Container.getInstance().resolve<DatabaseFacade>('Database');
                const permissions = await getPermissionsFromDB(db, userId, workspaceId);
                
                // Cache the result
                if (permissions.length > 0) {
                    await PermissionCache.set(userId, permissions, workspaceId);
                }
                
                hasPermission = hasPermissionFromArray(permissions, permission);
            }

            if (!hasPermission) {
                return res.status(403).json({ message: `Forbidden: Missing permission ${permission}` });
            }

            return next();
        } catch (error: any) {
            console.error('Permission check error:', error);
            // Fail closed for security
            return res.status(500).json({ message: 'Internal server error during permission check' });
        }
    };
};
