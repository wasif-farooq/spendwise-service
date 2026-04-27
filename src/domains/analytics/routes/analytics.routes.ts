import { Router } from 'express';
import { z } from 'zod';
import { AnalyticsController } from '../controllers/AnalyticsController';
import { requirePermission } from '@shared/middleware/permission.middleware';

const router = Router();
const controller = new AnalyticsController();

// Validation schemas
const WorkspaceIdParamSchema = z.object({
    workspaceId: z.string().uuid('Invalid workspace ID'),
});

const PeriodQuerySchema = z.object({
    period: z.enum(['week', 'month', 'year']).optional(),
});

const MonthsQuerySchema = z.object({
    months: z.coerce.number().min(1).max(24).optional(),
});

const LimitQuerySchema = z.object({
    limit: z.coerce.number().min(1).max(100).optional(),
});

const SpendingTrendQuerySchema = z.object({
    period: z.enum(['week', 'month', 'year']).optional(),
    accountId: z.string().uuid().optional(),
});

// Middleware to validate params
const validateParams = <T extends z.ZodType>(schema: T) => {
    return (req: any, res: any, next: any) => {
        const result = schema.safeParse(req.params);
        if (!result.success) {
            return res.status(400).json({ 
                message: 'Invalid parameters', 
                errors: result.error.errors 
            });
        }
        req.validated = result.data;
        next();
    };
};

// Middleware to validate query
const validateQuery = <T extends z.ZodType>(schema: T) => {
    return (req: any, res: any, next: any) => {
        const result = schema.safeParse(req.query);
        if (!result.success) {
            return res.status(400).json({ 
                message: 'Invalid query parameters', 
                errors: result.error.errors 
            });
        }
        req.validatedQuery = result.data;
        next();
    };
};

// Routes
router.get('/:workspaceId/analytics/overview', 
    validateParams(WorkspaceIdParamSchema),
    validateQuery(PeriodQuerySchema),
    requirePermission('analytics:view'), 
    controller.getOverview.bind(controller)
);

router.get('/:workspaceId/analytics/category-trends',
    validateParams(WorkspaceIdParamSchema),
    validateQuery(MonthsQuerySchema),
    requirePermission('analytics:view'),
    controller.getCategoryTrends.bind(controller)
);

router.get('/:workspaceId/analytics/monthly-comparison',
    validateParams(WorkspaceIdParamSchema),
    validateQuery(MonthsQuerySchema),
    requirePermission('analytics:view'),
    controller.getMonthlyComparison.bind(controller)
);

router.get('/:workspaceId/analytics/spending-trend',
    validateParams(WorkspaceIdParamSchema),
    validateQuery(SpendingTrendQuerySchema),
    requirePermission('analytics:view'),
    controller.getSpendingTrend.bind(controller)
);

router.get('/:workspaceId/analytics/top-merchants',
    validateParams(WorkspaceIdParamSchema),
    validateQuery(z.object({ ...MonthsQuerySchema.shape, ...LimitQuerySchema.shape })),
    requirePermission('analytics:view'),
    controller.getTopMerchants.bind(controller)
);

export default router;
