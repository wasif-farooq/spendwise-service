import { RequestHandler } from 'express';
import { Container } from '@di/Container';
import { TOKENS } from '@di/tokens';
import type { FeatureFlagService } from '@domains/feature-flags/services/FeatureFlagService';

/** Reads a flag through the FeatureFlagService, resolved on first use. */
export const isFeatureFlagOn = (key: string) => async (): Promise<boolean> => {
  const flags = Container.getInstance().resolve<FeatureFlagService>(TOKENS.FeatureFlagService);
  return flags.isEnabled(key);
};

export interface FeatureFlagGateOptions {
  /** How the flag is read (tests inject one). Default: the FeatureFlagService. */
  isEnabled?: () => Promise<boolean>;
  message?: string;
}

/**
 * 404 { code: 'FEATURE_DISABLED' } while the feature flag `key` is off. Runs
 * first, so a disabled feature looks like a route that doesn't exist. A failed
 * flag lookup counts as off.
 */
export const requireFeatureFlag =
  (key: string, options: FeatureFlagGateOptions = {}): RequestHandler =>
  async (_req, res, next) => {
    const isEnabled = options.isEnabled ?? isFeatureFlagOn(key);
    let enabled = false;
    try {
      enabled = await isEnabled();
    } catch {
      enabled = false;
    }
    if (!enabled) {
      res.status(404).json({
        message: options.message ?? 'This feature is not available.',
        code: 'FEATURE_DISABLED',
      });
      return;
    }
    next();
  };
