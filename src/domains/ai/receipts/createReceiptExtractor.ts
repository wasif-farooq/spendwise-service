import { OpenAICompatibleReceiptExtractor } from './OpenAICompatibleReceiptExtractor';
import type { ReceiptExtractor } from './types';

export interface ReceiptAiConfig {
  receiptProvider?: string;
  baseUrl?: string;
  apiKey?: string;
  receiptModel?: string;
  freeScansPerMonth?: number;
  timeoutMs?: number;
}

/** Providers that speak the OpenAI chat-completions protocol. */
const OPENAI_COMPATIBLE = new Set(['opencode', 'openai', 'openrouter', 'openai-compatible']);

/**
 * Picks the extractor for `ai.receiptProvider`. Returns null when scanning
 * isn't configured (no key, unknown provider), and the endpoints answer 503.
 * A Claude extractor would be another branch here; nothing else changes.
 */
export const createReceiptExtractor = (
  config: ReceiptAiConfig | undefined,
): ReceiptExtractor | null => {
  if (!config?.apiKey || !config.baseUrl || !config.receiptModel) return null;
  const provider = (config.receiptProvider || 'opencode').toLowerCase();

  if (OPENAI_COMPATIBLE.has(provider)) {
    return new OpenAICompatibleReceiptExtractor({
      provider,
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
      model: config.receiptModel,
      timeoutMs: config.timeoutMs,
    });
  }

  console.warn(`[ReceiptScan] unknown ai.receiptProvider "${provider}"; scanning is off`);
  return null;
};
