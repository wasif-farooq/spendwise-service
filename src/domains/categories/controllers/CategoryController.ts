import { Request, Response } from 'express';
import { CategoryRequestRepository } from '../repositories/CategoryRequestRepository';
import { SubscriptionRequestRepository } from '@domains/subscription/repositories/SubscriptionRequestRepository';
import { WorkspaceRequestRepository } from '@domains/workspaces/repositories/WorkspaceRequestRepository';
import { DatabaseFacade } from '@facades/DatabaseFacade';
import { Container } from '@di/Container';
import { TOKENS } from '@di/tokens';

export class CategoryController {
    constructor(
        private categoryRequestRepository: CategoryRequestRepository,
        private subscriptionRequestRepository?: SubscriptionRequestRepository,
        private workspaceRequestRepository?: WorkspaceRequestRepository
    ) { }

    private getUserId(req: Request): string {
        return (req as any).user?.userId || (req as any).user?.id || (req as any).user?.sub;
    }

    async getCategories(req: Request, res: Response) {
        const workspaceId = req.params.workspaceId;
        const { type } = req.query;

        try {
            let result;
            if (type && (type === 'income' || type === 'expense')) {
                result = await this.categoryRequestRepository.getCategoriesByType(type as 'income' | 'expense', workspaceId);
            } else {
                result = await this.categoryRequestRepository.getAllCategories(workspaceId);
            }

            if (result.error) {
                throw new Error(result.error);
            }

            res.json(result.data?.map((c: any) => c.getProps ? c.getProps() : c) || []);
        } catch (error: any) {
            res.status(400).json({ message: error.message });
        }
    }

    async getCategoryById(req: Request, res: Response) {
        const workspaceId = req.params.workspaceId;
        const { id } = req.params;

        try {
            const result = await this.categoryRequestRepository.getCategoryById(workspaceId, id, '');

            if (result.error) {
                throw new Error(result.error);
            }

            res.json(result.data?.getProps ? result.data.getProps() : result.data);
        } catch (error: any) {
            res.status(error.statusCode || 400).json({ message: error.message });
        }
    }

    async createCategory(req: Request, res: Response) {
        const workspaceId = req.params.workspaceId;
        const { name, type, icon, color, description } = req.body;
        const userId = this.getUserId(req);

        try {
            if (userId && this.subscriptionRequestRepository) {
                const currentCount = await this.categoryRequestRepository.countByWorkspace(workspaceId);

                let ownerId = userId;
                if (this.workspaceRequestRepository) {
                    const workspaceResult = await this.workspaceRequestRepository.getById(workspaceId, userId);
                    if (!workspaceResult.error && workspaceResult.data) {
                        ownerId = workspaceResult.data.ownerId;
                    }
                }

                await this.subscriptionRequestRepository.checkFeatureLimit(ownerId, 'categories_per_workspace', currentCount);
            }

            const result = await this.categoryRequestRepository.create(workspaceId, userId, {
                name,
                type: (type as 'income' | 'expense' | 'all') || 'all',
                icon,
                color,
                description,
                workspaceId,
            });

            if (result.error) {
                throw new Error(result.error);
            }

            res.status(201).json(result.data?.getProps ? result.data.getProps() : result.data);
        } catch (error: any) {
            res.status(error.statusCode || 400).json({ message: error.message });
        }
    }

    async updateCategory(req: Request, res: Response) {
        const workspaceId = req.params.workspaceId;
        const { id } = req.params;
        const { name, type, icon, color, description } = req.body;

        try {
            const result = await this.categoryRequestRepository.update(workspaceId, id, '', {
                name,
                type,
                icon,
                color,
                description,
            });

            if (result.error) {
                throw new Error(result.error);
            }

            res.json(result.data?.getProps ? result.data.getProps() : result.data);
        } catch (error: any) {
            res.status(error.statusCode || 400).json({ message: error.message });
        }
    }

    async deleteCategory(req: Request, res: Response) {
        const workspaceId = req.params.workspaceId;
        const { id } = req.params;

        try {
            const result = await this.categoryRequestRepository.delete(workspaceId, id, '');

            if (result.error) {
                throw new Error(result.error);
            }

            res.json({ message: 'Category deleted successfully' });
        } catch (error: any) {
            res.status(error.statusCode || 400).json({ message: error.message });
        }
    }

    async getCategoryTransactionCount(req: Request, res: Response) {
        const workspaceId = req.params.workspaceId;
        const { id } = req.params;

        try {
            const result = await this.categoryRequestRepository.getTransactionCount(id);

            if (result.error) {
                throw new Error(result.error);
            }

            res.json({ count: result.data });
        } catch (error: any) {
            res.status(error.statusCode || 400).json({ message: error.message });
        }
    }

    async getAllCategoryTransactionCounts(req: Request, res: Response) {
        const workspaceId = req.params.workspaceId;

        try {
            const result = await this.categoryRequestRepository.getAllTransactionCounts(workspaceId);

            if (result.error) {
                throw new Error(result.error);
            }

            res.json(result.data);
        } catch (error: any) {
            res.status(error.statusCode || 400).json({ message: error.message });
        }
    }

    async deleteCategoryWithReassign(req: Request, res: Response) {
        const workspaceId = req.params.workspaceId;
        const { id } = req.params;
        const { replaceWithId } = req.body;

        try {
            if (replaceWithId) {
                const reassignResult = await this.categoryRequestRepository.reassignTransactions(id, replaceWithId, workspaceId);
                if (reassignResult.error) {
                    throw new Error(reassignResult.error);
                }
            }

            const deleteResult = await this.categoryRequestRepository.delete(workspaceId, id, '');
            if (deleteResult.error) {
                throw new Error(deleteResult.error);
            }

            res.json({ message: 'Category deleted successfully' });
        } catch (error: any) {
            res.status(error.statusCode || 400).json({ message: error.message });
        }
    }
}