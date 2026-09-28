import { Request, Response } from 'express';
import { AppError } from '@shared/errors/AppError';
import { PushTokenService } from '../services/PushTokenService';

export class PushTokenController {
  constructor(private service: PushTokenService) {}

  private getUserId(req: Request): string {
    const userId = (req as any).user?.userId;
    if (!userId) throw new AppError('Unauthorized', 401);
    return userId;
  }

  async register(req: Request, res: Response) {
    const userId = this.getUserId(req);
    const saved = await this.service.register(userId, req.body);
    res.status(201).json({
      data: {
        token: saved.token,
        platform: saved.platform,
        deviceName: saved.deviceName,
        appVersion: saved.appVersion,
        lastSeenAt: saved.lastSeenAt,
      },
    });
  }

  async unregister(req: Request, res: Response) {
    const userId = this.getUserId(req);
    await this.service.unregister(userId, req.params.token);
    res.status(204).send();
  }
}
