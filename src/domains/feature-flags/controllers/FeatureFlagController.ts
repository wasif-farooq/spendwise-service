import { Request, Response } from 'express';
import { FeatureFlagRequestRepository } from '../repositories/FeatureFlagRequestRepository';

export class FeatureFlagController {
    constructor(private requestRepository: FeatureFlagRequestRepository) { }

    async getAll(req: Request, res: Response) {
        const result = await this.requestRepository.getAllFlags();

        if (result.error) {
            res.status(result.statusCode || 500).json({ message: result.error });
            return;
        }

        res.json(result);
    }
}
