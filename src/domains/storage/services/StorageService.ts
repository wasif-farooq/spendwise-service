import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Upload } from '@aws-sdk/lib-storage';
import { Inject } from '@di/decorators/inject.decorator';
import { TOKENS } from '@di/tokens';
import { ConfigLoader } from '@config/ConfigLoader';
import { StorageRepository } from '../repositories/StorageRepository';
import { Attachment } from '../models/Attachment';
import { v4 as uuidv4 } from 'uuid';

export interface UploadOptions {
    file: Buffer;
    filename: string;
    contentType: string;
    bucket: string;
    workspaceId: string;
    userId?: string;
    metadata?: Record<string, any>;
}

export interface StorageConfig {
    provider: string;
    endpoint: string;
    region: string;
    accessKeyId: string;
    secretAccessKey: string;
    buckets: {
        receipts: string;
        avatars: string;
        attachments: string;
    };
    publicUrl: string;
    presignedUrlExpiry: number;
    maxFileSize: number;
    allowedMimeTypes: string[];
}

export class StorageService {
    private s3Client: S3Client;
    private config: StorageConfig;

    constructor(
        protected repository: StorageRepository,
        @Inject(TOKENS.Config) private configLoader: ConfigLoader
    ) {
        this.config = this.configLoader.get('storage') as StorageConfig;
        
        this.s3Client = new S3Client({
            endpoint: this.config.endpoint,
            region: this.config.region,
            credentials: {
                accessKeyId: this.config.accessKeyId,
                secretAccessKey: this.config.secretAccessKey,
            },
            forcePathStyle: true, // Required for MinIO
        });
    }

    /**
     * Upload a file to storage
     */
    async uploadFile(options: UploadOptions): Promise<Attachment> {
        const { file, filename, contentType, bucket, workspaceId, userId, metadata = {} } = options;

        // Validate file type
        if (!this.config.allowedMimeTypes.includes(contentType)) {
            throw new Error(`File type ${contentType} is not allowed. Allowed types: ${this.config.allowedMimeTypes.join(', ')}`);
        }

        // Validate file size
        if (file.length > this.config.maxFileSize) {
            throw new Error(`File size exceeds maximum allowed size of ${this.config.maxFileSize} bytes`);
        }

        // Generate unique key
        const key = this.generateKey(workspaceId, filename);

        // Upload to S3/MinIO
        const upload = new Upload({
            client: this.s3Client,
            params: {
                Bucket: bucket,
                Key: key,
                Body: file,
                ContentType: contentType,
                Metadata: metadata,
            },
        });

        await upload.done();

        // Save metadata to database
        const attachment = await this.repository.create({
            workspaceId,
            userId,
            bucket,
            key,
            filename,
            contentType,
            size: file.length,
            metadata,
        });

        return attachment;
    }

    /**
     * Delete a file from storage
     */
    async deleteFile(attachmentId: string): Promise<void> {
        const attachment = await this.repository.findById(attachmentId);
        if (!attachment) {
            throw new Error('Attachment not found');
        }

        // Delete from S3/MinIO
        const command = new DeleteObjectCommand({
            Bucket: attachment.bucket,
            Key: attachment.key,
        });

        await this.s3Client.send(command);

        // Delete from database
        await this.repository.delete(attachmentId);
    }

    /**
     * Get file metadata and presigned URL
     */
    async getFile(attachmentId: string): Promise<{ attachment: Attachment; url: string; urlExpiresAt: Date }> {
        const attachment = await this.repository.findById(attachmentId);
        if (!attachment) {
            throw new Error('Attachment not found');
        }

        const url = await this.getPresignedUrl(attachment.bucket, attachment.key);
        const urlExpiresAt = new Date(Date.now() + this.config.presignedUrlExpiry * 1000);

        return { attachment, url, urlExpiresAt };
    }

    /**
     * Get presigned URL for download
     */
    async getPresignedUrl(bucket: string, key: string, expiresIn?: number): Promise<string> {
        const command = new GetObjectCommand({
            Bucket: bucket,
            Key: key,
        });

        const expiry = expiresIn || this.config.presignedUrlExpiry;
        return getSignedUrl(this.s3Client, command, { expiresIn: expiry });
    }

    /**
     * Get presigned URL for upload
     */
    async getUploadPresignedUrl(bucket: string, key: string, contentType: string): Promise<string> {
        const command = new PutObjectCommand({
            Bucket: bucket,
            Key: key,
            ContentType: contentType,
        });

        return getSignedUrl(this.s3Client, command, { expiresIn: this.config.presignedUrlExpiry });
    }

    /**
     * Check if file exists in storage
     */
    async fileExists(bucket: string, key: string): Promise<boolean> {
        try {
            const command = new HeadObjectCommand({
                Bucket: bucket,
                Key: key,
            });
            await this.s3Client.send(command);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Get public URL for a file
     */
    getPublicUrl(bucket: string, key: string): string {
        return `${this.config.publicUrl}/${bucket}/${key}`;
    }

    /**
     * Generate a unique key for file storage
     */
    private generateKey(workspaceId: string, filename: string): string {
        const ext = filename.split('.').pop() || '';
        const uuid = uuidv4();
        return `${workspaceId}/${uuid}${ext ? '.' + ext : ''}`;
    }

    /**
     * Get bucket name by type
     */
    getBucket(type: 'receipts' | 'avatars' | 'attachments'): string {
        return this.config.buckets[type];
    }

    /**
     * Initialize buckets (call on startup)
     */
    async initializeBuckets(): Promise<void> {
        // For MinIO, we could create buckets here if needed
        // Usually not required as they're created on first use
        console.log('Storage buckets configured:', this.config.buckets);
    }

    /**
     * List attachments by workspace
     */
    async listByWorkspace(workspaceId: string, limit = 50, offset = 0): Promise<Attachment[]> {
        return this.repository.findByWorkspace(workspaceId, limit, offset);
    }
}
