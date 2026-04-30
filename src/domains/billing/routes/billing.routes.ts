import { Router, Request, Response } from 'express';
import { BillingController } from '../controllers/BillingController';
import { PromoCodeService } from '../../promo-codes/services/PromoCodeService';
import { DatabaseFacade } from '@facades/DatabaseFacade';
import { Container } from '@di/Container';
import { TOKENS } from '@di/tokens';

const router = Router();
const controller = new BillingController();

router.get('/', (req, res, next) => controller.getBillingData(req, res).catch(next));
router.get('/history', (req, res, next) => controller.getHistory(req, res).catch(next));
router.get('/invoices/:id', (req, res, next) => controller.getInvoice(req, res).catch(next));
router.get('/invoices/:id/download', (req, res, next) => controller.downloadInvoice(req, res).catch(next));

router.post('/validate-promo', async (req: Request, res: Response) => {
    try {
        const { code } = req.body;
        if (!code) {
            res.status(400).json({ message: 'Promo code is required' });
            return;
        }

        const db = Container.getInstance().resolve<DatabaseFacade>(TOKENS.Database);
        const promoService = new PromoCodeService(db);
        const result = await promoService.validate(code);

        res.json({
            data: result,
            error: null,
            statusCode: 200,
        });
    } catch (error: any) {
        console.error('[Billing] Error validating promo code:', error);
        res.status(500).json({ message: error.message || 'Failed to validate promo code' });
    }
});

router.post('/apply-promo', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user?.userId || (req as any).user?.sub;
        if (!userId) {
            res.status(401).json({ message: 'Unauthorized' });
            return;
        }

        const { code, amount } = req.body;
        if (!code || !amount) {
            res.status(400).json({ message: 'Promo code and amount are required' });
            return;
        }

        const db = Container.getInstance().resolve<DatabaseFacade>(TOKENS.Database);
        const promoService = new PromoCodeService(db);
        const result = await promoService.apply(code, userId, amount);

        res.json({
            data: result,
            error: null,
            statusCode: 200,
        });
    } catch (error: any) {
        console.error('[Billing] Error applying promo code:', error);
        res.status(500).json({ message: error.message || 'Failed to apply promo code' });
    }
});

router.post('/change-plan', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user?.userId || (req as any).user?.sub;
        if (!userId) {
            res.status(401).json({ message: 'Unauthorized' });
            return;
        }

        const { planId } = req.body;
        if (!planId) {
            res.status(400).json({ message: 'Plan ID is required' });
            return;
        }

        const db = Container.getInstance().resolve<DatabaseFacade>(TOKENS.Database);
        const subService = Container.getInstance().resolve<any>(TOKENS.SubscriptionService);
        
        const subscription = await subService.upgrade(userId, planId);

        res.json({
            data: { subscription },
            error: null,
            statusCode: 200,
        });
    } catch (error: any) {
        console.error('[Billing] Error changing plan:', error);
        res.status(500).json({ message: error.message || 'Failed to change plan' });
    }
});

router.post('/cancel', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user?.userId || (req as any).user?.sub;
        if (!userId) {
            res.status(401).json({ message: 'Unauthorized' });
            return;
        }

        const db = Container.getInstance().resolve<DatabaseFacade>(TOKENS.Database);
        const subService = Container.getInstance().resolve<any>(TOKENS.SubscriptionService);
        
        await subService.cancelSubscription(userId, true);

        res.json({
            data: { message: 'Subscription will be cancelled at period end' },
            error: null,
            statusCode: 200,
        });
    } catch (error: any) {
        console.error('[Billing] Error cancelling subscription:', error);
        res.status(500).json({ message: error.message || 'Failed to cancel subscription' });
    }
});

export default router;