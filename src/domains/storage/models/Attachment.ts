// Attachment model - matches database schema
export interface Attachment {
    id: string;
    workspaceId: string;
    userId?: string;
    bucket: string;
    key: string;
    filename: string;
    contentType: string;
    size: number;
    metadata: Record<string, any>;
    createdAt: Date;
    updatedAt: Date;
}

// Helper to create an Attachment instance
export function createAttachment(data: Partial<Attachment>): Attachment {
    return {
        id: data.id || '',
        workspaceId: data.workspaceId || '',
        userId: data.userId,
        bucket: data.bucket || '',
        key: data.key || '',
        filename: data.filename || '',
        contentType: data.contentType || '',
        size: data.size || 0,
        metadata: data.metadata || {},
        createdAt: data.createdAt || new Date(),
        updatedAt: data.updatedAt || new Date(),
    };
}
