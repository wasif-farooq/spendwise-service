import { NextFunction, Request, Response } from 'express';
import { SettingsRequestRepository } from './repositories/SettingsRequestRepository';
import { AppError } from '@shared/errors/AppError';

export class SettingsController {
    constructor(private settingsRequestRepository: SettingsRequestRepository) { }

    private getUserId(req: Request): string {
        return (req as any).user?.userId || (req as any).user?.sub || (req as any).user?.id;
    }

    async getPreferences(req: Request, res: Response, next: NextFunction) {
        try {
            const userId = this.getUserId(req);
            const result = await this.settingsRequestRepository.getPreferences(userId);

            if (result.error) {
                throw new AppError(result.error, result.statusCode || 500);
            }

            res.json({ data: result.data });
        } catch (error) {
            next(error);
        }
    }

    async updatePreferences(req: Request, res: Response, next: NextFunction) {
        try {
            const userId = this.getUserId(req);
            const result = await this.settingsRequestRepository.updatePreferences(userId, req.body);

            if (result.error) {
                throw new AppError(result.error, result.statusCode || 500);
            }

            res.json({ data: result.data });
        } catch (error) {
            next(error);
        }
    }

    async getSecuritySettings(req: Request, res: Response, next: NextFunction) {
        try {
            const userId = this.getUserId(req);
            const result = await this.settingsRequestRepository.getSecuritySettings(userId);

            if (result.error) {
                throw new AppError(result.error, result.statusCode || 400);
            }

            const is2FAEnabled = result.data?.twoFactorEnabled || false;
            const verifiedMethods = result.data?.twoFactorMethods || [];
            const availableMethods = [
                {
                    type: 'authenticator',
                    enabled: verifiedMethods.some((m: any) => m.type === 'app' && m.verified),
                    verified: verifiedMethods.some((m: any) => m.type === 'app' && m.verified)
                },
                {
                    type: 'sms',
                    enabled: verifiedMethods.some((m: any) => m.type === 'sms' && m.verified),
                    verified: verifiedMethods.some((m: any) => m.type === 'sms' && m.verified)
                },
                {
                    type: 'email',
                    enabled: verifiedMethods.some((m: any) => m.type === 'email' && m.verified),
                    verified: verifiedMethods.some((m: any) => m.type === 'email' && m.verified)
                }
            ];

            res.json({
                data: {
                    twoFactorEnabled: is2FAEnabled,
                    twoFactorMethod: result.data?.twoFactorMethod === 'app' ? 'authenticator' : result.data?.twoFactorMethod,
                    availableMethods
                }
            });
        } catch (error) {
            next(error);
        }
    }

    async changePassword(req: Request, res: Response, next: NextFunction) {
        try {
            const userId = this.getUserId(req);
            const result = await this.settingsRequestRepository.changePassword(userId, req.body);

            if (result.error) {
                throw new AppError(result.error, result.statusCode || 400);
            }

            res.json({ message: 'Password changed successfully' });
        } catch (error) {
            next(error);
        }
    }

    async setup2FA(req: Request, res: Response, next: NextFunction) {
        try {
            const userId = this.getUserId(req);
            const { method: rawMethod, email } = req.body;
            const method = rawMethod === 'authenticator' ? 'app' : rawMethod;
            const result = await this.settingsRequestRepository.setup2FA(userId, { method, email });

            if (result.error) {
                throw new AppError(result.error, result.statusCode || 400);
            }

            res.json({ data: result.data });
        } catch (error) {
            next(error);
        }
    }

    async enable2FA(req: Request, res: Response, next: NextFunction) {
        try {
            const userId = this.getUserId(req);
            const method = req.body.method === 'authenticator' ? 'app' : req.body.method;
            const result = await this.settingsRequestRepository.enable2FA(userId, { code: req.body.code, method });

            if (result.error) {
                throw new AppError(result.error, result.statusCode || 400);
            }

            res.json({ message: '2FA enabled successfully' });
        } catch (error) {
            next(error);
        }
    }

    async disable2FA(req: Request, res: Response, next: NextFunction) {
        try {
            const userId = this.getUserId(req);
            const result = await this.settingsRequestRepository.disable2FA(userId);

            if (result.error) {
                throw new AppError(result.error, result.statusCode || 400);
            }

            res.json({ message: '2FA disabled successfully' });
        } catch (error) {
            next(error);
        }
    }

    async delete2FAMethod(req: Request, res: Response, next: NextFunction) {
        try {
            const userId = this.getUserId(req);
            const method = req.params.method === 'authenticator' ? 'app' : req.params.method;
            const result = await this.settingsRequestRepository.disable2FA(userId);

            if (result.error) {
                throw new AppError(result.error, result.statusCode || 400);
            }

            res.json({ message: `${req.params.method} method removed successfully` });
        } catch (error) {
            next(error);
        }
    }

    async regenerateBackupCodes(req: Request, res: Response, next: NextFunction) {
        try {
            const userId = this.getUserId(req);
            const result = await this.settingsRequestRepository.regenerateBackupCodes(userId);

            if (result.error) {
                throw new AppError(result.error, result.statusCode || 400);
            }

            res.json({ data: result.data });
        } catch (error) {
            next(error);
        }
    }

    async getActiveSessions(req: Request, res: Response, next: NextFunction) {
        try {
            const userId = this.getUserId(req);
            const result = await this.settingsRequestRepository.getActiveSessions(userId);

            if (result.error) {
                throw new AppError(result.error, result.statusCode || 400);
            }

            res.json({ data: result.data });
        } catch (error) {
            next(error);
        }
    }

    async revokeSession(req: Request, res: Response, next: NextFunction) {
        try {
            const userId = this.getUserId(req);
            const { sessionId } = req.params;
            const result = await this.settingsRequestRepository.revokeSession(userId, sessionId);

            if (result.error) {
                throw new AppError(result.error, result.statusCode || 400);
            }

            res.json({ message: 'Session revoked successfully' });
        } catch (error) {
            next(error);
        }
    }

    async getLoginHistory(req: Request, res: Response, next: NextFunction) {
        try {
            const userId = this.getUserId(req);
            const result = await this.settingsRequestRepository.getLoginHistory(userId);

            if (result.error) {
                throw new AppError(result.error, result.statusCode || 400);
            }

            res.json({ data: result.data });
        } catch (error) {
            next(error);
        }
    }
}