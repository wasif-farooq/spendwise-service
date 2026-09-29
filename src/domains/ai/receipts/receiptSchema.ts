import { z } from 'zod';
import type { RawReceipt } from './types';

/**
 * Validates the model's JSON. Lenient about representation (numbers sent as
 * strings, "12,50" decimal commas, missing optional keys) but strict about
 * meaning: anything that isn't a finite number, a string or null is rejected,
 * and the caller retries once.
 */

const toNumber = (value: unknown): unknown => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (trimmed === '') return null;
  const digits = trimmed.replace(/[^0-9.,-]/g, '');
  // "€12,50" (decimal comma, no thousands) → 12.50; "1,234.56" → 1234.56
  const normalised = /^-?\d+,\d{1,2}$/.test(digits)
    ? digits.replace(',', '.')
    : digits.replace(/,/g, '');
  const parsed = Number(normalised);
  return normalised === '' || Number.isNaN(parsed) ? value : parsed;
};

const amount = z.preprocess(toNumber, z.number().finite().nullable()).optional().default(null);

const text = z
  .preprocess((v) => (typeof v === 'string' ? v.trim() || null : v), z.string().max(200).nullable())
  .optional()
  .default(null);

const confidence = z
  .preprocess(toNumber, z.number().min(0).max(1).nullable())
  .optional()
  .default(null);

export const ReceiptSchema = z.object({
  isReceipt: z.boolean(),
  merchant: text,
  total: amount,
  subtotal: amount,
  tax: amount,
  currency: text,
  date: text,
  category: text,
  lineItems: z
    .array(
      z.object({
        description: z.preprocess((v) => (v == null ? '' : v), z.string().max(200)),
        amount,
      }),
    )
    .nullable()
    .optional()
    .transform((items) => (items ?? []).slice(0, 50)),
  confidence: z
    .object({ total: confidence, date: confidence, merchant: confidence })
    .nullable()
    .optional()
    .transform((c) => c ?? { total: null, date: null, merchant: null }),
});

/** Pull the JSON object out of a model reply (tolerates ```json fences and chatter). */
export const extractJsonObject = (content: string): unknown => {
  const unfenced = content.replace(/```(?:json)?/gi, '');
  const start = unfenced.indexOf('{');
  const end = unfenced.lastIndexOf('}');
  if (start === -1 || end <= start) throw new Error('no JSON object in the reply');
  return JSON.parse(unfenced.slice(start, end + 1));
};

export const parseReceiptReply = (content: string): RawReceipt =>
  ReceiptSchema.parse(extractJsonObject(content)) as RawReceipt;
