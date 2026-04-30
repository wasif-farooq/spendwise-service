import { Request, Response } from 'express';
import { PaymentRepository } from '@domains/payment/repositories/PaymentRepository';
import { DatabaseFacade } from '@facades/DatabaseFacade';
import { Container } from '@di/Container';
import { TOKENS } from '@di/tokens';
import { UserSubscriptionRepository } from '@domains/subscription/repositories/SubscriptionRepository';
import { SubscriptionPlanRepository } from '@domains/subscription/repositories/SubscriptionRepository';
import { UserRepository } from '@domains/auth/repositories/UserRepository';

export class BillingController {
    private paymentRepo: PaymentRepository;
    private subscriptionRepo: UserSubscriptionRepository;
    private planRepo: SubscriptionPlanRepository;

    constructor() {
        const db = Container.getInstance().resolve<DatabaseFacade>(TOKENS.Database);
        this.paymentRepo = new PaymentRepository(db);
        this.subscriptionRepo = new UserSubscriptionRepository(db);
        this.planRepo = new SubscriptionPlanRepository(db);
    }

    async getBillingData(req: Request, res: Response): Promise<void> {
        const userId = (req as any).user?.userId || (req as any).user?.sub;
        if (!userId) {
            res.status(401).json({ message: 'Unauthorized' });
            return;
        }

        try {
            const subscription = await this.subscriptionRepo.findByUserId(userId);
            let plan = null;
            
            if (subscription?.planId) {
                plan = await this.planRepo.findById(subscription.planId);
            }

            const payments = await this.paymentRepo.findByUserId(userId, 5);

            res.json({
                data: {
                    subscription: subscription ? {
                        id: subscription.id,
                        status: subscription.status,
                        planId: subscription.planId,
                        planName: plan?.name,
                        price: plan?.price,
                        yearlyPrice: plan?.yearlyPrice,
                        currentPeriodEnd: subscription.currentPeriodEnd,
                        paymentProvider: subscription.paymentProvider,
                        merchantSubscriptionId: subscription.merchantSubscriptionId,
                    } : null,
                    plan: plan ? {
                        id: plan.id,
                        name: plan.name,
                        price: plan.price,
                        yearlyPrice: plan.yearlyPrice,
                        features: plan.features,
                        limits: plan.limits,
                    } : null,
                    recentPayments: payments.map(p => ({
                        id: p.id,
                        amount: p.amount,
                        currency: p.currency,
                        status: p.status,
                        type: p.type,
                        invoiceUrl: p.invoiceUrl,
                        invoicePdf: p.invoicePdf,
                        createdAt: p.createdAt,
                    })),
                },
                error: null,
                statusCode: 200,
            });
        } catch (error: any) {
            console.error('[BillingController] Error getting billing data:', error);
            res.status(500).json({ message: error.message || 'Failed to get billing data' });
        }
    }

    async getHistory(req: Request, res: Response): Promise<void> {
        const userId = (req as any).user?.userId || (req as any).user?.sub;
        if (!userId) {
            res.status(401).json({ message: 'Unauthorized' });
            return;
        }

        try {
            const limit = parseInt(req.query.limit as string) || 20;
            const offset = parseInt(req.query.offset as string) || 0;

            const payments = await this.paymentRepo.findByUserId(userId, limit, offset);
            const total = await this.paymentRepo.countByUserId(userId);

            res.json({
                data: {
                    payments: payments.map(p => ({
                        id: p.id,
                        amount: p.amount,
                        currency: p.currency,
                        status: p.status,
                        type: p.type,
                        invoiceUrl: p.invoiceUrl,
                        invoicePdf: p.invoicePdf,
                        description: p.description,
                        createdAt: p.createdAt,
                    })),
                    pagination: {
                        total,
                        limit,
                        offset,
                        hasMore: offset + limit < total,
                    },
                },
                error: null,
                statusCode: 200,
            });
        } catch (error: any) {
            console.error('[BillingController] Error getting payment history:', error);
            res.status(500).json({ message: error.message || 'Failed to get payment history' });
        }
    }

    async getInvoice(req: Request, res: Response): Promise<void> {
        const userId = (req as any).user?.userId || (req as any).user?.sub;
        if (!userId) {
            res.status(401).json({ message: 'Unauthorized' });
            return;
        }

        try {
            const { id } = req.params;
            const payment = await this.paymentRepo.findById(id);

            if (!payment) {
                res.status(404).json({ message: 'Invoice not found' });
                return;
            }

            if (payment.userId !== userId) {
                res.status(403).json({ message: 'Access denied' });
                return;
            }

            res.json({
                data: {
                    id: payment.id,
                    amount: payment.amount,
                    currency: payment.currency,
                    status: payment.status,
                    type: payment.type,
                    invoiceUrl: payment.invoiceUrl,
                    invoicePdf: payment.invoicePdf,
                    description: payment.description,
                    createdAt: payment.createdAt,
                },
                error: null,
                statusCode: 200,
            });
        } catch (error: any) {
            console.error('[BillingController] Error getting invoice:', error);
            res.status(500).json({ message: error.message || 'Failed to get invoice' });
        }
    }

    async downloadInvoice(req: Request, res: Response): Promise<void> {
        const userId = (req as any).user?.userId || (req as any).user?.sub;
        if (!userId) {
            res.status(401).json({ message: 'Unauthorized' });
            return;
        }

        try {
            const { id } = req.params;
            const payment = await this.paymentRepo.findById(id);

            if (!payment) {
                res.status(404).json({ message: 'Invoice not found' });
                return;
            }

            if (payment.userId !== userId) {
                res.status(403).json({ message: 'Access denied' });
                return;
            }

            if (!payment.invoicePdf) {
                res.status(404).json({ message: 'Invoice PDF not available' });
                return;
            }

            res.redirect(payment.invoicePdf);
        } catch (error: any) {
            console.error('[BillingController] Error downloading invoice:', error);
            res.status(500).json({ message: error.message || 'Failed to download invoice' });
        }
    }
}