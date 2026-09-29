import { Request, Response } from 'express';
import type { ReceiptScanService } from './ReceiptScanService';
import { ReceiptImageMimeType, ReceiptScanError } from './types';
import { sendScanError } from './receiptScan.middleware';

/** Errors are answered here as `{ message, code }` so the apps can branch on `code`. */
export class ReceiptScanController {
  constructor(private readonly getService: () => Promise<ReceiptScanService>) {}

  private userIdOf(req: Request): string {
    const user = (req as any).user;
    return user?.userId || user?.sub;
  }

  private fail(res: Response, error: unknown) {
    if (error instanceof ReceiptScanError) {
      sendScanError(res, error);
      return;
    }
    console.error('[ReceiptScan] unexpected error', (error as Error)?.message);
    res.status(500).json({ message: 'Could not scan the receipt.', code: 'SCAN_FAILED' });
  }

  async scan(req: Request, res: Response) {
    try {
      const service = await this.getService();
      const file = req.file as Express.Multer.File;
      const result = await service.scan({
        workspaceId: req.params.workspaceId,
        userId: this.userIdOf(req),
        image: file.buffer,
        mimeType: file.mimetype as ReceiptImageMimeType,
      });
      res.setHeader('Cache-Control', 'no-store');
      res.json({ data: result });
    } catch (error) {
      this.fail(res, error);
    }
  }

  async usage(req: Request, res: Response) {
    try {
      const service = await this.getService();
      res.setHeader('Cache-Control', 'no-store');
      res.json({ data: await service.getUsage(req.params.workspaceId) });
    } catch (error) {
      this.fail(res, error);
    }
  }
}
