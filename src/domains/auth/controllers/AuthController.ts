import { Request, Response, NextFunction } from 'express';
import { AuthRequestRepository } from '../repositories/AuthRequestRepository';

export class AuthController {
    constructor(private authRequestRepository: AuthRequestRepository) { }

    async login(req: Request, res: Response) {
        const result = await this.authRequestRepository.login(req.body);

        if (result.error) {
            res.status(result.statusCode || 400).json({ message: result.error });
            return;
        }

        res.json(result);
    }

    async register(req: Request, res: Response) {
        const result = await this.authRequestRepository.register(req.body);

        if (result.error) {
            res.status(result.statusCode || 400).json({ message: result.error });
            return;
        }

        res.status(201).json(result);
    }

    async verify2FA(req: Request, res: Response) {
        const result = await this.authRequestRepository.verify2FA(req.body);
        if (result.error) {
            res.status(result.statusCode || 400).json({ message: result.error });
            return;
        }
        res.json(result);
    }

    async resend2FA(req: Request, res: Response) {
        const result = await this.authRequestRepository.resend2FA(req.body);
        if (result.error) {
            res.status(result.statusCode || 400).json({ message: result.error });
            return;
        }
        res.json(result);
    }

    async verifyBackupCode(req: Request, res: Response) {
        const result = await this.authRequestRepository.verifyBackupCode(req.body);
        if (result.error) {
            res.status(result.statusCode || 400).json({ message: result.error });
            return;
        }
        res.json(result);
    }

    async forgotPassword(req: Request, res: Response) {
        const result = await this.authRequestRepository.forgotPassword(req.body);
        if (result.error) {
            res.status(result.statusCode || 400).json({ message: result.error });
            return;
        }
        res.json(result);
    }

    async verifyResetCode(req: Request, res: Response) {
        const result = await this.authRequestRepository.verifyResetCode(req.body);
        if (result.error) {
            res.status(result.statusCode || 400).json({ message: result.error });
            return;
        }
        res.json(result);
    }

    async resetPassword(req: Request, res: Response) {
        const result = await this.authRequestRepository.resetPassword(req.body);
        if (result.error) {
            res.status(result.statusCode || 400).json({ message: result.error });
            return;
        }
        res.json(result);
    }

    async verifyEmail(req: Request, res: Response) {
        const result = await this.authRequestRepository.verifyEmail(req.body);
        if (result.error) {
            res.status(result.statusCode || 400).json({ message: result.error });
            return;
        }
        res.json(result);
    }

    async getMe(req: Request, res: Response) {
        // userId should be attached by requireAuth middleware
        const userId = (req as any).user?.userId || (req as any).user?.sub;
        if (!userId) {
            res.status(401).json({ message: 'Unauthorized' });
            return;
        }

        const result = await this.authRequestRepository.getMe(userId);
        if (result.error) {
            res.status(result.statusCode || 404).json({ message: result.error });
            return;
        }
        res.json(result);
    }

    async refresh(req: Request, res: Response) {
        const result = await this.authRequestRepository.refresh(req.body);
        if (result.error) {
            res.status(result.statusCode || 401).json({ message: result.error });
            return;
        }
        res.json(result);
    }

    async changePassword(req: Request, res: Response) {
        const userId = (req as any).user?.userId || (req as any).user?.sub;
        if (!userId) {
            res.status(401).json({ message: 'Unauthorized' });
            return;
        }

        const result = await this.authRequestRepository.changePassword(userId, req.body);
        if (result.error) {
            res.status(result.statusCode || 400).json({ message: result.error });
            return;
        }
        res.json(result);
    }
}
