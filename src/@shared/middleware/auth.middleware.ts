import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { ConfigLoader } from '@config/ConfigLoader';
import { StructuredLogger } from '@monitoring/logging/StructuredLogger';

const logger = new StructuredLogger();

export const authMiddleware = (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;

    logger.info(`[AuthMiddleware] URL: ${req.method} ${req.url}`);
    logger.info(`[AuthMiddleware] All Headers: ${JSON.stringify(req.headers)}`);
    logger.info(`[AuthMiddleware] Auth Header: ${authHeader ? 'Present' : 'Missing'}`);

    if (authHeader) {
        console.log(`[AuthMiddleware] Token (first 20 chars): ${authHeader.substring(0, 20)}...`);
    }

    if (!authHeader) {
        console.warn(`[AuthMiddleware] 401 Unauthorized: No token provided for ${req.method} ${req.url}`);
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
        const decoded = jwt.verify(token, secret);

        (req as any).user = decoded;

        return next();
    } catch (err) {
        return res.status(401).json({ message: 'Invalid token' });
    }
};

export const requireAuth = authMiddleware;

