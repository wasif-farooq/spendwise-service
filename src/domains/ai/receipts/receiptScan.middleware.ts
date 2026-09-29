import { NextFunction, Request, RequestHandler, Response } from 'express';
import multer, { MulterError } from 'multer';
import { createRateLimiter, RateLimitStore } from '@shared/middleware/rateLimit.middleware';
import type { ReceiptScanService } from './ReceiptScanService';
import {
  RECEIPT_SCAN_MESSAGES,
  ReceiptImageMimeType,
  ReceiptScanError,
  receiptScanError,
} from './types';

export const RECEIPT_MAX_BYTES = 10 * 1024 * 1024;

export const sendScanError = (res: Response, error: ReceiptScanError) =>
  res.status(error.statusCode).json({ message: error.message, code: error.code });

const userKey = (req: Request) => {
  const user = (req as any).user;
  return user?.userId || user?.sub || req.ip || 'unknown';
};

/**
 * 503 when scanning isn't configured, 402 SCAN_LIMIT_REACHED when the owner's
 * monthly allowance is used up. Runs before the upload so a refused scan never
 * buffers the file. The 402 body mirrors the plan-limit message ("limit of N
 * receipt scans") so the apps can reuse their upgrade prompt.
 */
export const receiptScanQuota =
  (getService: () => Promise<ReceiptScanService>): RequestHandler =>
  async (req, res, next) => {
    try {
      const service = await getService();
      if (!service.isAvailable) {
        sendScanError(res, receiptScanError('AI_UNAVAILABLE', 503));
        return;
      }
      const usage = await service.getUsage(req.params.workspaceId);
      if (usage.limit !== null && usage.used >= usage.limit) {
        res.status(402).json({
          message: `You have reached the limit of ${usage.limit} receipt scans this month. Upgrade your plan to scan unlimited receipts.`,
          code: 'SCAN_LIMIT_REACHED',
          feature: 'receiptScans',
          usage,
        });
        return;
      }
      next();
    } catch (error) {
      next(error);
    }
  };

/** Fair use for everyone, unlimited plans included: 20 scan attempts per user per hour. */
export const createReceiptScanLimiter = (store?: RateLimitStore) =>
  createRateLimiter(
    {
      bucket: 'receipt-scan',
      max: 20,
      windowSeconds: 60 * 60,
      message: RECEIPT_SCAN_MESSAGES.TOO_MANY_SCANS,
      code: 'TOO_MANY_SCANS',
      keyGenerator: userKey,
    },
    store,
  );

const ALLOWED: ReadonlySet<string> = new Set(['image/jpeg', 'image/png', 'image/webp']);

/** What the bytes are, whatever the client claimed. */
export const sniffImageType = (buf: Buffer): ReceiptImageMimeType | 'application/pdf' | null => {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (
    buf.length >= 8 &&
    buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  )
    return 'image/png';
  if (
    buf.length >= 12 &&
    buf.toString('ascii', 0, 4) === 'RIFF' &&
    buf.toString('ascii', 8, 12) === 'WEBP'
  )
    return 'image/webp';
  if (buf.length >= 4 && buf.toString('ascii', 0, 4) === '%PDF') return 'application/pdf';
  return null;
};

const multerUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: RECEIPT_MAX_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf') return cb(receiptScanError('PDF_NOT_SUPPORTED', 415));
    if (!ALLOWED.has(file.mimetype)) return cb(receiptScanError('UNSUPPORTED_TYPE', 415));
    cb(null, true);
  },
}).single('file');

/**
 * multipart field `file`: JPEG, PNG or WebP up to 10 MB, kept in memory only.
 * 413 FILE_TOO_LARGE, 415 UNSUPPORTED_TYPE / PDF_NOT_SUPPORTED, 400 FILE_REQUIRED.
 */
export const receiptScanUpload: RequestHandler = (req, res, next: NextFunction) => {
  multerUpload(req, res, (error: unknown) => {
    if (error instanceof ReceiptScanError) return sendScanError(res, error);
    if (error instanceof MulterError) {
      if (error.code === 'LIMIT_FILE_SIZE') {
        return sendScanError(res, receiptScanError('FILE_TOO_LARGE', 413));
      }
      return sendScanError(res, receiptScanError('FILE_REQUIRED', 400));
    }
    if (error) return next(error);
    if (!req.file?.buffer?.length)
      return sendScanError(res, receiptScanError('FILE_REQUIRED', 400));

    const actual = sniffImageType(req.file.buffer);
    if (actual === 'application/pdf')
      return sendScanError(res, receiptScanError('PDF_NOT_SUPPORTED', 415));
    if (!actual) return sendScanError(res, receiptScanError('UNSUPPORTED_TYPE', 415));
    req.file.mimetype = actual;
    next();
  });
};
