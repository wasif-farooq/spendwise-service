import { NextFunction, Request, Response } from 'express';
import { UserRequestRepository } from '@domains/users/repositories/UserRequestRepository';
import { AuthRequestRepository } from '@domains/auth/repositories/AuthRequestRepository';
import { UserPreferencesService } from '@domains/users/services/UserPreferencesService';
import { ServiceFactory } from '@factories/ServiceFactory';
import { DatabaseFacade } from '@facades/DatabaseFacade';
import { PostgresFactory } from '@database/factories/PostgresFactory';
import { RepositoryFactory } from '@factories/RepositoryFactory';
import { AppError } from '@shared/errors/AppError';

// Create service instances directly
const dbFacade = new DatabaseFacade(new PostgresFactory());
const repoFactory = new RepositoryFactory(dbFacade);
const serviceFactory = new ServiceFactory(repoFactory, dbFacade);
const userPreferencesService = serviceFactory.createUserPreferencesService();

export class SettingsController {
    constructor(
        private userRequestRepository: UserRequestRepository,
        private authRequestRepository: AuthRequestRepository
    ) { }

    async getPreferences(req: Request, res: Response, next: NextFunction) {
        try {
            const userId = (req as any).user.userId || (req as any).user.sub || (req as any).user.id;
            const prefs = await userPreferencesService.getPreferences(userId);
            res.json({ data: prefs.toDTO() });
        } catch (error) {
            next(error);
        }
    }

    async updatePreferences(req: Request, res: Response, next: NextFunction) {
        try {
            const userId = (req as any).user.userId || (req as any).user.sub || (req as any).user.id;
            const prefs = await userPreferencesService.updatePreferences(userId, req.body);
            res.json({ data: prefs.toDTO() });
        } catch (error) {
            next(error);
        }
    }

    async getSecuritySettings(req: Request, res: Response, next: NextFunction) {
        try {
            const userId = (req as any).user.userId || (req as any).user.sub || (req as any).user.id;
            const result = await this.authRequestRepository.getMe(userId);

            if (result.error) {
                throw new AppError(result.error, result.statusCode || 400);
            }

            // Map backend methods to frontend format
            const is2FAEnabled = result.twoFactorEnabled || false;
            const availableMethods = [
                {
                    type: 'authenticator',
                    enabled: is2FAEnabled && result.twoFactorMethod === 'app',
                    verified: (result.twoFactorMethods || []).some((m: any) => m.type === 'app' && m.verified)
                },
                {
                    type: 'sms',
                    enabled: is2FAEnabled && result.twoFactorMethod === 'sms',
                    verified: (result.twoFactorMethods || []).some((m: any) => m.type === 'sms' && m.verified)
                },
                {
                    type: 'email',
                    enabled: is2FAEnabled && result.twoFactorMethod === 'email',
                    verified: (result.twoFactorMethods || []).some((m: any) => m.type === 'email' && m.verified)
                }
            ];

            res.json({
                data: {
                    twoFactorEnabled: is2FAEnabled,
                    twoFactorMethod: result.twoFactorMethod === 'app' ? 'authenticator' : result.twoFactorMethod,
                    availableMethods
                }
            });
        } catch (error) {
            next(error);
        }
    }

    async changePassword(req: Request, res: Response, next: NextFunction) {
        try {
            const userId = (req as any).user.userId || (req as any).user.sub || (req as any).user.id;
            const result = await this.authRequestRepository.changePassword(userId, req.body);

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
            const userId = (req as any).user.userId || (req as any).user.sub || (req as any).user.id;
            const { method: rawMethod, email } = req.body;
            const method = rawMethod === 'authenticator' ? 'app' : rawMethod;
            const result = await this.authRequestRepository.generate2FASecret(userId, method, email);

            if (result.error) {
                throw new AppError(result.error, result.statusCode || 400);
            }

            res.json({ data: result });
        } catch (error) {
            next(error);
        }
    }

    async enable2FA(req: Request, res: Response, next: NextFunction) {
        try {
            const userId = (req as any).user.userId || (req as any).user.sub || (req as any).user.id;
            const method = req.body.method === 'authenticator' ? 'app' : req.body.method;
            const result = await this.authRequestRepository.enable2FA(userId, req.body.code, method);

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
            const userId = (req as any).user.userId || (req as any).user.sub || (req as any).user.id;
            const result = await this.authRequestRepository.disable2FA(userId);

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
            const userId = (req as any).user.userId || (req as any).user.sub || (req as any).user.id;
            const method = req.params.method === 'authenticator' ? 'app' : req.params.method;
            const result = await this.authRequestRepository.disable2FAMethod(userId, method);

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
            const userId = (req as any).user.userId || (req as any).user.sub || (req as any).user.id;
            const result = await this.authRequestRepository.regenerateBackupCodes(userId);

            if (result.error) {
                throw new AppError(result.error, result.statusCode || 400);
            }

            res.json({ data: result });
        } catch (error) {
            next(error);
        }
    }

    async getActiveSessions(req: Request, res: Response, next: NextFunction) {
        try {
            const userId = (req as any).user.userId || (req as any).user.sub || (req as any).user.id;
            const result = await this.authRequestRepository.getActiveSessions(userId);

            if (result.error) {
                throw new AppError(result.error, result.statusCode || 400);
            }

            res.json({ data: result });
        } catch (error) {
            next(error);
        }
    }

    async revokeSession(req: Request, res: Response, next: NextFunction) {
        try {
            const userId = (req as any).user.userId || (req as any).user.sub || (req as any).user.id;
            const { sessionId } = req.params;
            const result = await this.authRequestRepository.revokeSession(userId, sessionId);

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
            const userId = (req as any).user.userId || (req as any).user.sub || (req as any).user.id;
            const result = await this.authRequestRepository.getLoginHistory(userId);

            if (result.error) {
                throw new AppError(result.error, result.statusCode || 400);
            }

            res.json({ data: result });
        } catch (error) {
            next(error);
        }
    }
}
