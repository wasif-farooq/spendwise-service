import { Request, Response } from 'express';
import { StorageService } from '../services/StorageService';
import { ConfigLoader } from '@config/ConfigLoader';

// Extend Express Request type to include user
declare global {
    namespace Express {
        interface Request {
            user?: {
                id: string;
                email: string;
            };
        }
    }
}

export class StorageController {
    constructor(
        private service: StorageService,
        private config: ConfigLoader
    ) {}

    /**
     * POST /v1/storage/upload
     * Upload a file
     */
    async upload(req: Request, res: Response): Promise<void> {
        try {
            if (!req.file) {
                res.status(400).json({ error: 'No file uploaded' });
                return;
            }

            const { bucket: bucketParam, workspaceId, userId } = req.body;
            const storageConfig = this.config.get('storage');
            
            // Determine bucket
            let bucket = bucketParam || storageConfig.buckets.attachments;
            if (!Object.values(storageConfig.buckets).includes(bucket)) {
                bucket = storageConfig.buckets.attachments;
            }

            if (!workspaceId) {
                res.status(400).json({ error: 'workspaceId is required' });
                return;
            }

            const attachment = await this.service.uploadFile({
                file: req.file.buffer,
                filename: req.file.originalname,
                contentType: req.file.mimetype,
                bucket,
                workspaceId,
                userId: userId || req.user?.id,
            });

            // Get presigned URL for immediate use
            const { url, urlExpiresAt } = await this.service.getFile(attachment.id);

            res.status(201).json({
                id: attachment.id,
                workspaceId: attachment.workspaceId,
                userId: attachment.userId,
                bucket: attachment.bucket,
                key: attachment.key,
                filename: attachment.filename,
                contentType: attachment.contentType,
                size: attachment.size,
                url,
                urlExpiresAt,
                createdAt: attachment.createdAt,
            });
        } catch (error) {
            console.error('Upload error:', error);
            res.status(500).json({ error: error instanceof Error ? error.message : 'Upload failed' });
        }
    }

    /**
     * GET /v1/storage/:id
     * Get file metadata and presigned URL
     */
    async get(req: Request, res: Response): Promise<void> {
        try {
            const { id } = req.params;

            const { attachment, url, urlExpiresAt } = await this.service.getFile(id);

            res.json({
                id: attachment.id,
                workspaceId: attachment.workspaceId,
                userId: attachment.userId,
                bucket: attachment.bucket,
                key: attachment.key,
                filename: attachment.filename,
                contentType: attachment.contentType,
                size: attachment.size,
                metadata: attachment.metadata,
                url,
                urlExpiresAt,
                createdAt: attachment.createdAt,
                updatedAt: attachment.updatedAt,
            });
        } catch (error) {
            console.error('Get file error:', error);
            res.status(404).json({ error: error instanceof Error ? error.message : 'File not found' });
        }
    }

    /**
     * DELETE /v1/storage/:id
     * Delete a file
     */
    async delete(req: Request, res: Response): Promise<void> {
        try {
            const { id } = req.params;

            await this.service.deleteFile(id);

            res.status(204).send();
        } catch (error) {
            console.error('Delete file error:', error);
            res.status(404).json({ error: error instanceof Error ? error.message : 'File not found' });
        }
    }

    /**
     * GET /v1/storage/:id/download
     * Redirect to presigned URL for download
     */
    async download(req: Request, res: Response): Promise<void> {
        try {
            const { id } = req.params;

            const { attachment, url } = await this.service.getFile(id);

            // Set headers for download
            res.setHeader('Content-Disposition', `attachment; filename="${attachment.filename}"`);
            res.setHeader('Content-Type', attachment.contentType);
            
            // Redirect to presigned URL
            res.redirect(url);
        } catch (error) {
            console.error('Download error:', error);
            res.status(404).json({ error: error instanceof Error ? error.message : 'File not found' });
        }
    }

    /**
     * POST /v1/storage/refresh-url/:id
     * Refresh presigned URL
     */
    async refreshUrl(req: Request, res: Response): Promise<void> {
        try {
            const { id } = req.params;

            const { url, urlExpiresAt } = await this.service.getFile(id);

            res.json({
                url,
                urlExpiresAt,
            });
        } catch (error) {
            console.error('Refresh URL error:', error);
            res.status(404).json({ error: error instanceof Error ? error.message : 'File not found' });
        }
    }

    /**
     * GET /v1/storage/workspace/:workspaceId
     * List files for a workspace
     */
    async listByWorkspace(req: Request, res: Response): Promise<void> {
        try {
            const { workspaceId } = req.params;
            const limit = parseInt(req.query.limit as string) || 50;
            const offset = parseInt(req.query.offset as string) || 0;

            const attachments = await this.service.listByWorkspace(workspaceId, limit, offset);

            res.json({
                data: attachments,
                pagination: {
                    limit,
                    offset,
                },
            });
        } catch (error) {
            console.error('List files error:', error);
            res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to list files' });
        }
    }
}
