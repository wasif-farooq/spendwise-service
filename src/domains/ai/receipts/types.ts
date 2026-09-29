/**
 * Receipt scanning: provider-independent types.
 *
 * A `ReceiptExtractor` turns a receipt photo into a `RawReceipt` (what the model
 * read). `ReceiptScanService` then maps that onto the workspace (category id,
 * account, rounding, warnings). Swapping the model or vendor means writing
 * another extractor; the service, controller and apps don't change.
 */

export type ReceiptImageMimeType = 'image/jpeg' | 'image/png' | 'image/webp';

export interface ReceiptExtractInput {
  image: Buffer;
  mimeType: ReceiptImageMimeType;
  /** Category names the model may choose from (exactly one, or null). */
  categories: string[];
  /** ISO 4217 code assumed when the receipt shows no currency. */
  currencyHint: string;
  /** Today as YYYY-MM-DD, so the model can resolve two-digit years. */
  today: string;
}

export interface RawReceiptLineItem {
  description: string;
  amount: number | null;
}

/** What the model read, before any mapping onto the workspace. */
export interface RawReceipt {
  isReceipt: boolean;
  merchant: string | null;
  total: number | null;
  subtotal: number | null;
  tax: number | null;
  currency: string | null;
  date: string | null;
  category: string | null;
  lineItems: RawReceiptLineItem[];
  confidence: { total: number | null; date: number | null; merchant: number | null };
}

export interface ReceiptExtractUsage {
  inputTokens: number | null;
  outputTokens: number | null;
}

export interface ReceiptExtractResult {
  receipt: RawReceipt;
  usage: ReceiptExtractUsage;
  provider: string;
  model: string;
}

export interface ReceiptExtractor {
  readonly provider: string;
  readonly model: string;
  extract(input: ReceiptExtractInput): Promise<ReceiptExtractResult>;
}

export type ReceiptScanErrorCode =
  | 'FILE_REQUIRED'
  | 'FILE_TOO_LARGE'
  | 'UNSUPPORTED_TYPE'
  | 'PDF_NOT_SUPPORTED'
  | 'NOT_A_RECEIPT'
  | 'UNREADABLE'
  | 'SCAN_LIMIT_REACHED'
  | 'TOO_MANY_SCANS'
  | 'AI_UNAVAILABLE';

/** Errors answered as `{ message, code }` with `statusCode`. */
export class ReceiptScanError extends Error {
  constructor(
    public readonly code: ReceiptScanErrorCode,
    public readonly statusCode: number,
    message: string,
    /** Provider tokens spent before the failure, for the scan log. */
    public readonly usage?: ReceiptExtractUsage,
  ) {
    super(message);
    this.name = 'ReceiptScanError';
  }
}

export const RECEIPT_SCAN_MESSAGES: Record<ReceiptScanErrorCode, string> = {
  FILE_REQUIRED: 'Attach a photo of the receipt in the "file" field.',
  FILE_TOO_LARGE: 'That file is too large. The limit is 10 MB.',
  UNSUPPORTED_TYPE: 'Use a JPEG, PNG or WebP photo of the receipt.',
  PDF_NOT_SUPPORTED: 'PDF scanning is coming soon. Take a photo of the receipt instead.',
  NOT_A_RECEIPT: "That doesn't look like a receipt.",
  UNREADABLE: "Couldn't read the receipt. Try a sharper photo.",
  SCAN_LIMIT_REACHED: 'You have reached the limit of receipt scans this month.',
  TOO_MANY_SCANS: 'Too many receipt scans. Please try again later.',
  AI_UNAVAILABLE: "Receipt scanning isn't available right now. You can enter it manually.",
};

export const receiptScanError = (
  code: ReceiptScanErrorCode,
  statusCode: number,
  usage?: ReceiptExtractUsage,
) => new ReceiptScanError(code, statusCode, RECEIPT_SCAN_MESSAGES[code], usage);
