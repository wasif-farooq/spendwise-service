import { Request, Response, NextFunction } from 'express';
import { UrlVersionStrategy } from '../strategies/UrlVersionStrategy';
import { ApiVersion } from '../ApiVersion';

// Extend Express Request
declare global {
  namespace Express {
    interface Request {
      apiVersion?: ApiVersion;
    }
  }
}

export const versionMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const version = UrlVersionStrategy.extract(req);

  if (version) {
    req.apiVersion = version;
    next();
  } else {
    // If no version found, we might default or error.
    // For now, let's default to V1 if not found, or pass through (maybe it's a health check or non-versioned route)
    // Actually, strict versioning is better.
    // If /api/vX is expected, and not found, maybe 404?
    // Let's pass null and let router handle it if it requires version.
    next();
  }
};
