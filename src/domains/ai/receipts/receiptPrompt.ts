import type { ReceiptExtractInput } from './types';

/**
 * The fixed instruction. Only the category list, currency hint and date vary
 * per request, and they go in the user message.
 */
export const RECEIPT_SYSTEM_PROMPT = `You read photos of purchase receipts for a personal finance app.
Reply with ONE JSON object and nothing else (no prose, no code fences), exactly this shape:
{
  "isReceipt": boolean,
  "merchant": string | null,
  "total": number | null,
  "subtotal": number | null,
  "tax": number | null,
  "currency": string | null,
  "date": string | null,
  "category": string | null,
  "lineItems": [{ "description": string, "amount": number | null }],
  "confidence": { "total": number, "date": number, "merchant": number }
}
Rules:
- isReceipt: false when the image is not a receipt, invoice or bill for a purchase. Then set every other field to null and lineItems to [].
- total: the final amount actually paid, after tax, discounts and any tip or service charge (the TOTAL / AMOUNT DUE / BALANCE / card charge line). Never the subtotal, the cash tendered or the change.
- If a tip is handwritten or printed after the pre-tip total, total includes the tip.
- merchant: the business name as printed at the top of the receipt, without address, legal suffix or store number.
- currency: ISO 4217 code from the symbols or text on the receipt (€ is EUR, £ is GBP). null when the receipt gives no clue.
- date: the purchase date as YYYY-MM-DD. For dates like 03/04/2026, read day first for receipts in EUR or GBP and month first for USD. null when not legible.
- category: exactly one name copied verbatim from the category list given by the user, or null when none fits.
- Numbers are JSON numbers with a dot as the decimal separator and no currency symbols.
- lineItems: the purchased items (at most 30), with their line amounts.
- confidence: 0 to 1, how sure you are of the total, date and merchant.
- Use null for anything you cannot read. Never guess or invent values.`;

export const buildReceiptUserText = (
  input: Pick<ReceiptExtractInput, 'categories' | 'currencyHint' | 'today'>,
) =>
  [
    `Today is ${input.today}.`,
    `If the receipt shows no currency, the user's usual currency is ${input.currencyHint}.`,
    `Category list: ${JSON.stringify(input.categories)}`,
    'Read the attached receipt and reply with the JSON object.',
  ].join('\n');
