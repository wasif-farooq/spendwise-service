import { Attachment } from '../models/Attachment';

export interface IStorageRepository {
    create(attachment: Partial<Attachment>): Promise<Attachment>;
    findById(id: string): Promise<Attachment | null>;
    findByWorkspace(workspaceId: string, limit?: number, offset?: number): Promise<Attachment[]>;
    findByUser(userId: string): Promise<Attachment[]>;
    findByBucketAndKey(bucket: string, key: string): Promise<Attachment | null>;
    delete(id: string): Promise<void>;
    update(id: string, data: Partial<Attachment>): Promise<Attachment>;
    countByWorkspace(workspaceId: string): Promise<number>;
}
