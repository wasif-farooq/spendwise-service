import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { ConfigLoader } from '@config/ConfigLoader';
import { StructuredLogger } from '@monitoring/logging/StructuredLogger';

const logger = new StructuredLogger();

const publicPaths = [
  '/health',
  '/auth/',
  '/payment/webhook',
  '/payment/webhooks',
  '/metrics',
  '/favicon.ico',
];

const isPublicPath = (path: string) => {
  return publicPaths.some((publicPath) => path.startsWith(publicPath));
};

export const authMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;

  if (isPublicPath(req.path)) {
    return next();
  }

  // Never log headers or token material — the Authorization header is a
  // live credential and logs are retained far longer than tokens live.
  logger.info(
    `[AuthMiddleware] ${req.method} ${req.url} auth=${authHeader ? 'present' : 'missing'}`,
  );

  if (!authHeader) {
    return res.status(401).json({ message: 'No token provided' });
  }

  const parts = authHeader.split(' ');

  if (parts.length !== 2) {
    return res.status(401).json({ message: 'Token error' });
  }

  const [scheme, token] = parts;

  if (!/^Bearer$/i.test(scheme)) {
    return res.status(401).json({ message: 'Token malformatted' });
  }

  try {
    const config = ConfigLoader.getInstance();
    const secret = config.get('auth.jwt.secret');
    const decoded = jwt.verify(token, secret) as any;

    // Tokens minted for another purpose (refresh, password reset, pending 2FA)
    // share the same signing secret and must not be accepted as a session.
    // Legacy access tokens carry no purpose claim, so only reject mismatches.
    if (decoded?.purpose && decoded.purpose !== 'access') {
      return res.status(401).json({ message: 'Invalid token' });
    }

    (req as any).user = decoded;

    return next();
  } catch (err) {
    return res.status(401).json({ message: 'Invalid token' });
  }
};

export const requireAuth = authMiddleware;
