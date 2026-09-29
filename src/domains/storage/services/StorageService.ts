import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  CreateBucketCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
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
  workspaceId?: string;
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
    @Inject(TOKENS.Config) private configLoader: ConfigLoader,
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
      throw new Error(
        `File type ${contentType} is not allowed. Allowed types: ${this.config.allowedMimeTypes.join(', ')}`,
      );
    }

    // Validate file size
    if (file.length > this.config.maxFileSize) {
      throw new Error(`File size exceeds maximum allowed size of ${this.config.maxFileSize} bytes`);
    }

    // Generate unique key
    const key = this.generateKey(workspaceId, userId, filename);

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
   * Delete objects straight from S3/MinIO, without touching the attachments table
   * (used after the rows are already gone, e.g. by account deletion). Batches of up to
   * 1000 keys per bucket, as S3 allows. Returns how many objects were deleted.
   */
  async deleteObjects(objects: Array<{ bucket: string; key: string }>): Promise<number> {
    const byBucket = new Map<string, string[]>();
    for (const { bucket, key } of objects) {
      if (!bucket || !key) continue;
      byBucket.set(bucket, [...(byBucket.get(bucket) ?? []), key]);
    }

    let deleted = 0;
    for (const [bucket, keys] of byBucket) {
      for (let i = 0; i < keys.length; i += 1000) {
        const batch = keys.slice(i, i + 1000);
        const result = await this.s3Client.send(
          new DeleteObjectsCommand({
            Bucket: bucket,
            Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: true },
          }),
        );
        if (result.Errors?.length) {
          throw new Error(
            `Could not delete ${result.Errors.length} object(s) from ${bucket}: ${result.Errors[0].Code}`,
          );
        }
        deleted += batch.length;
      }
    }
    return deleted;
  }

  /** Delete every object under a key prefix (e.g. `avatars/<userId>/`). */
  async deletePrefix(bucket: string, prefix: string): Promise<number> {
    if (!prefix) throw new Error('Refusing to delete an empty prefix');
    let deleted = 0;
    let token: string | undefined;
    do {
      const page = await this.s3Client.send(
        new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }),
      );
      const keys = (page.Contents ?? []).map((o) => o.Key).filter((k): k is string => !!k);
      if (keys.length > 0) {
        deleted += await this.deleteObjects(keys.map((key) => ({ bucket, key })));
      }
      token = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (token);
    return deleted;
  }

  /**
   * Get file metadata and presigned URL
   */
  async getFile(
    attachmentId: string,
  ): Promise<{ attachment: Attachment; url: string; urlExpiresAt: Date }> {
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
  private generateKey(
    workspaceId: string | undefined,
    userId: string | undefined,
    filename: string,
  ): string {
    const ext = filename.split('.').pop() || '';
    const uuid = uuidv4();
    // For user-specific uploads (avatars), use userId as prefix
    // For workspace-specific uploads, use workspaceId as prefix
    let prefix: string;
    if (workspaceId) {
      prefix = `${workspaceId}/`;
    } else if (userId) {
      prefix = `users/${userId}/`;
    } else {
      prefix = 'uploads/';
    }
    return `${prefix}${uuid}${ext ? '.' + ext : ''}`;
  }

  /**
   * Get bucket name by type
   */
  getBucket(type: 'receipts' | 'avatars' | 'attachments'): string {
    // Check if bucket is configured and valid
    if (this.config.buckets?.[type]) {
      return this.config.buckets[type];
    }

    // Fallback logic: try to use receipts bucket for other types
    if (type !== 'receipts' && this.config.buckets?.receipts) {
      return this.config.buckets.receipts;
    }

    // Return a guaranteed valid bucket name
    const defaultBuckets: Record<string, string> = {
      receipts: 'trackmypocket-receipts',
      avatars: 'trackmypocket-avatars',
      attachments: 'trackmypocket-attachments',
    };

    return defaultBuckets[type] || 'trackmypocket-receipts';
  }

  /**
   * Initialize buckets (call on startup)
   */
  async initializeBuckets(): Promise<void> {
    // Quick initialization - just log the config
    // Actual bucket creation happens on first use (MinIO auto-creates)
    console.log(
      'Storage buckets configured:',
      this.getBucket('receipts'),
      this.getBucket('avatars'),
      this.getBucket('attachments'),
    );
  }

  /**
   * List attachments by workspace
   */
  async listByWorkspace(workspaceId: string, limit = 50, offset = 0): Promise<Attachment[]> {
    return this.repository.findByWorkspace(workspaceId, limit, offset);
  }
}
