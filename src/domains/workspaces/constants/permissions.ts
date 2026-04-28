export const PERMISSIONS = {
    DASHBOARD: {
        VIEW: 'dashboard:view'
    },
    TRANSACTIONS: {
        VIEW: 'transactions:view',
        CREATE: 'transactions:create',
        EDIT: 'transactions:edit',
        DELETE: 'transactions:delete'
    },
    CATEGORIES: {
        VIEW: 'categories:view',
        CREATE: 'categories:create',
        EDIT: 'categories:edit',
        DELETE: 'categories:delete'
    },
    MEMBERS: {
        VIEW: 'members:view',
        CREATE: 'members:create', // invite
        DELETE: 'members:delete', // remove
        EDIT: 'members:edit' // role assignment
    },
    ROLES: {
        VIEW: 'roles:view',
        CREATE: 'roles:create',
        EDIT: 'roles:edit',
        DELETE: 'roles:delete'
    },
    BILLING: {
        VIEW: 'billing:view',
        EDIT: 'billing:edit'
    },
    ACCOUNTS: {
        VIEW: 'accounts:view',
        CREATE: 'accounts:create',
        EDIT: 'accounts:edit', // manage access
        DELETE: 'accounts:delete'
    },
    WORKSPACE: {
        UPDATE: 'workspace:update',
        DELETE: 'workspace:delete'
    },
    STORAGE: {
        VIEW: 'storage:view',
        CREATE: 'storage:create',
        DELETE: 'storage:delete'
    },
    ANALYTICS: {
        VIEW: 'analytics:view',
        EXPORT: 'analytics:export'
    },
    SUBSCRIPTION: {
        VIEW: 'subscription:view',
        EDIT: 'subscription:edit'
    },
    AI_ADVISOR: {
        VIEW: 'aiAdvisor:view',
        USE: 'aiAdvisor:use'
    }
} as const;

export const ALL_PERMISSIONS = Object.values(PERMISSIONS).flatMap(group => Object.values(group));
