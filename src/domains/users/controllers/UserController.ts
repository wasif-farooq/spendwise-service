import { Request, Response, NextFunction } from 'express';
import { UserRequestRepository } from '../repositories/UserRequestRepository';
import { AppError } from '@shared/errors/AppError';

export class UserController {
    constructor(private userRequestRepository: UserRequestRepository) { }

    async getProfile(req: Request, res: Response) {
        const userId = (req as any).user?.userId;

        if (!userId) {
            throw new AppError('Unauthorized', 401);
        }

        const user = await this.userRequestRepository.getProfile(userId);
        res.json(user);
    }

    async updateProfile(req: Request, res: Response) {
        const userId = (req as any).user?.userId;
        if (!userId) {
            throw new AppError('Unauthorized', 401);
        }

        const user = await this.userRequestRepository.updateProfile(userId, req.body);
        res.json(user);
    }
}
