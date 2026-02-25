// Simple in-memory permission cache (for single-instance deployments)
// For multi-instance, use Redis

interface PermissionCache {
    permissions: string[];
    expiresAt: number;
}

const cache = new Map<string, PermissionCache>();

const CACHE_TTL = 3600 * 1000; // 1 hour in ms

const getCacheKey = (userId: string, workspaceId?: string): string => {
    if (workspaceId) {
        return `permission:${userId}:${workspaceId}`;
    }
    return `permission:${userId}:all`;
};

export const PermissionCache = {
    /**
     * Get cached permissions for a user in a workspace
     */
    async get(userId: string, workspaceId?: string): Promise<string[] | null> {
        try {
            const key = getCacheKey(userId, workspaceId);
            const cached = cache.get(key);
            
            if (cached && cached.expiresAt > Date.now()) {
                return cached.permissions;
            }
            
            // Expired or not found
            if (cached) {
                cache.delete(key);
            }
            return null;
        } catch (error) {
            console.error('PermissionCache.get error:', error);
            return null;
        }
    },

    /**
     * Set permissions for a user in a workspace
     */
    async set(userId: string, permissions: string[], workspaceId?: string): Promise<void> {
        try {
            const key = getCacheKey(userId, workspaceId);
            cache.set(key, {
                permissions,
                expiresAt: Date.now() + CACHE_TTL
            });
        } catch (error) {
            console.error('PermissionCache.set error:', error);
        }
    },

    /**
     * Invalidate all permissions for a user (across all workspaces)
     */
    async invalidateUser(userId: string): Promise<void> {
        try {
            const keysToDelete: string[] = [];
            for (const key of cache.keys()) {
                if (key.startsWith(`permission:${userId}:`)) {
                    keysToDelete.push(key);
                }
            }
            keysToDelete.forEach(key => cache.delete(key));
        } catch (error) {
            console.error('PermissionCache.invalidateUser error:', error);
        }
    },

    /**
     * Invalidate permissions for a specific user in a specific workspace
     */
    async invalidate(userId: string, workspaceId?: string): Promise<void> {
        try {
            const key = getCacheKey(userId, workspaceId);
            cache.delete(key);
        } catch (error) {
            console.error('PermissionCache.invalidate error:', error);
        }
    },

    /**
     * Invalidate all permissions for all users in a workspace (when roles change)
     */
    async invalidateWorkspace(workspaceId: string): Promise<void> {
        try {
            const keysToDelete: string[] = [];
            for (const key of cache.keys()) {
                if (key.endsWith(`:${workspaceId}`)) {
                    keysToDelete.push(key);
                }
            }
            keysToDelete.forEach(key => cache.delete(key));
        } catch (error) {
            console.error('PermissionCache.invalidateWorkspace error:', error);
        }
    },
};
