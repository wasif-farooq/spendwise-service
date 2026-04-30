import { Request, Response } from 'express';
import { ConfigLoader } from '@config/ConfigLoader';
import { AppError } from '@shared/errors/AppError';
import { DatabaseFacade } from '@facades/DatabaseFacade';
import { Container } from '@di/Container';
import { TOKENS } from '@di/tokens';
import { UserSubscriptionRepository } from '@domains/subscription/repositories/SubscriptionRepository';
import { UserRepository } from '@domains/auth/repositories/UserRepository';

const INVOICES_BUCKET = 'spendwise-invoices';

export class StripeWebhookHandler {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private stripe: any;
    private config: any;

    constructor() {
        this.config = ConfigLoader.getInstance();
        const stripeSecretKey = this.config.get('stripe.secretKey');
        if (!stripeSecretKey) {
            throw new AppError('Stripe not configured', 500);
        }
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const Stripe = require('stripe');
        this.stripe = new Stripe(stripeSecretKey);
    }

    async handleWebhook(req: Request, res: Response): Promise<void> {
        const sig = req.headers['stripe-signature'] as string;
        const webhookSecret = this.config.get('stripe.webhookSecret');

        let event: any;

        try {
            if (webhookSecret) {
                event = this.stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
            } else {
                event = req.body;
            }
        } catch (err: any) {
            console.error('[StripeWebhook] Signature verification failed:', err.message);
            res.status(400).send(`Webhook Error: ${err.message}`);
            return;
        }

        console.log(`[StripeWebhook] Received event: ${event.type}`);

        try {
            switch (event.type) {
                case 'checkout.session.completed':
                    await this.handleCheckoutSessionCompleted(event.data.object);
                    break;
                case 'customer.subscription.created':
                    await this.handleSubscriptionCreated(event.data.object);
                    break;
                case 'invoice.payment_succeeded':
                    await this.handleInvoicePaymentSucceeded(event.data.object);
                    break;
                case 'invoice.payment_failed':
                    await this.handleInvoicePaymentFailed(event.data.object);
                    break;
                case 'customer.subscription.updated':
                    await this.handleSubscriptionUpdated(event.data.object);
                    break;
                case 'customer.subscription.deleted':
                    await this.handleSubscriptionDeleted(event.data.object);
                    break;
                default:
                    console.log(`[StripeWebhook] Unhandled event type: ${event.type}`);
            }

            res.json({ received: true });
        } catch (error: any) {
            console.error('[StripeWebhook] Error handling webhook:', error);
            res.status(500).send(`Webhook handler error: ${error.message}`);
        }
    }

private async handleCheckoutSessionCompleted(session: any): Promise<void> {
        const db = Container.getInstance().resolve<DatabaseFacade>(TOKENS.Database);
        const userRepo = new UserRepository(db);
        const subRepo = new UserSubscriptionRepository(db);

        const customerId = session.customer;
        const subscriptionId = session.subscription;
        const userId = session.client_reference_id || session.metadata?.userId;
        const planId = session.metadata?.planId;
        const amountTotal = session.amount_total;
        const currency = session.currency;

        console.log(`[StripeWebhook] Checkout session completed:`, {
            customerId,
            subscriptionId,
            userId,
            planId,
            amountTotal,
            currency,
            metadata: session.metadata
        });

        if (!userId) {
            console.error('[StripeWebhook] No userId in session metadata');
            return;
        }

        if (!planId) {
            console.error('[StripeWebhook] No planId in session metadata');
            return;
        }

        const existingSub = await subRepo.findByUserId(userId);
        let subId: string;
        if (existingSub) {
            await subRepo.update(existingSub.id, {
                planId: planId,
                status: 'active',
                merchantSubscriptionId: subscriptionId,
                paymentProvider: 'stripe',
            });
            console.log(`[StripeWebhook] Updated subscription for user ${userId} to plan ${planId}`);
            subId = existingSub.id;
        } else {
            const newSub = await subRepo.create({
                userId,
                planId: planId,
                status: 'active',
                merchantSubscriptionId: subscriptionId,
                paymentProvider: 'stripe',
            });
            console.log(`[StripeWebhook] Created subscription for user ${userId} with plan ${planId}`);
            subId = newSub.id;
        }

        if (amountTotal && amountTotal > 0) {
            await this.createPaymentRecord(db, {
                userId,
                subscriptionId: subId,
                stripeInvoiceId: session.invoice as string || undefined,
                amount: amountTotal,
                currency: currency?.toUpperCase() || 'USD',
                status: 'succeeded',
                type: 'payment',
                invoiceUrl: session.invoice?.hosted_invoice_url || undefined,
            });
            console.log(`[StripeWebhook] Created payment record for user ${userId}`);
        }

        console.log(`[StripeWebhook] Checkout completed for user ${userId}`);
    }

    private async handleSubscriptionCreated(subscription: any): Promise<void> {
        const db = Container.getInstance().resolve<DatabaseFacade>(TOKENS.Database);
        const subRepo = new UserSubscriptionRepository(db);
        const userRepo = new UserRepository(db);

        const subscriptionId = subscription.id;
        const customerId = subscription.customer;
        const customerEmail = subscription.customer_email || subscription.email;
        const planId = subscription.metadata?.planId;
        const userId = subscription.metadata?.userId;

        if (!subscriptionId) {
            console.error('[StripeWebhook] No subscription ID in subscription.created');
            return;
        }

        let existingSub = null;

        if (userId) {
            existingSub = await subRepo.findByUserId(userId);
        }

        if (existingSub) {
            await subRepo.update(existingSub.id, {
                merchantSubscriptionId: subscriptionId,
                paymentProvider: 'stripe',
            });
            console.log(`[StripeWebhook] Updated subscription ${existingSub.id} with merchantSubscriptionId ${subscriptionId}`);
        } else {
            console.log(`[StripeWebhook] No existing subscription found for user ${userId}`);
        }
    }

    private async handleInvoicePaymentSucceeded(invoice: any): Promise<void> {
        const db = Container.getInstance().resolve<DatabaseFacade>(TOKENS.Database);
        const subRepo = new UserSubscriptionRepository(db);

        const subscriptionId = invoice.subscription;
        const invoiceId = invoice.id;
        const amountPaid = invoice.amount_paid;
        const currency = invoice.currency;

        let invoicePdf: string | null = null;
        let invoiceUrl: string | null = null;

        if (invoice.invoice_pdf) {
            try {
                invoicePdf = await this.downloadAndUploadPdf(invoice.invoice_pdf, invoiceId);
            } catch (err) {
                console.error('[StripeWebhook] Failed to upload invoice PDF:', err);
            }
        }

        if (invoice.hosted_invoice_url) {
            invoiceUrl = invoice.hosted_invoice_url;
        }

        const existingSub = await subRepo.findByMerchantSubscriptionId(subscriptionId);

        if (existingSub) {
            await this.createPaymentRecord(db, {
                userId: existingSub.userId,
                subscriptionId: existingSub.id,
                stripeInvoiceId: invoiceId,
                amount: amountPaid,
                currency: currency.toUpperCase(),
                status: 'succeeded',
                type: 'payment',
                invoiceUrl: invoiceUrl || undefined,
                invoicePdf: invoicePdf || undefined,
            });

            console.log(`[StripeWebhook] Invoice payment succeeded for subscription ${subscriptionId}`);
        } else {
            console.log(`[StripeWebhook] No subscription found for ${subscriptionId}, skipping payment record`);
        }
    }

    private async handleInvoicePaymentFailed(invoice: any): Promise<void> {
        const db = Container.getInstance().resolve<DatabaseFacade>(TOKENS.Database);
        const subRepo = new UserSubscriptionRepository(db);
        const userRepo = new UserRepository(db);

        const subscriptionId = invoice.subscription;
        const invoiceId = invoice.id;
        const amountDue = invoice.amount_due;
        const currency = invoice.currency;

        console.log(`[StripeWebhook] Invoice payment failed: ${invoiceId}, subscription: ${subscriptionId}`);

        const existingSub = subscriptionId ? await subRepo.findByMerchantSubscriptionId(subscriptionId) : null;

        if (existingSub) {
            await this.createPaymentRecord(db, {
                userId: existingSub.userId,
                subscriptionId: existingSub.id,
                stripeInvoiceId: invoiceId,
                amount: amountDue,
                currency: currency.toUpperCase(),
                status: 'failed',
                type: 'payment',
            });

            await subRepo.updateStatusAndPeriod(existingSub.id, 'past_due');
            console.log(`[StripeWebhook] Marked subscription ${subscriptionId} as past_due`);

            const user = await userRepo.findById(existingSub.userId);
            if (user) {
                await this.sendPaymentFailureEmail(user.email, user.firstName || 'User', amountDue, currency.toUpperCase());
            }
        } else {
            console.log(`[StripeWebhook] No subscription found for ${subscriptionId}, skipping payment record`);
        }
    }

    private async handleSubscriptionUpdated(subscription: any): Promise<void> {
        const db = Container.getInstance().resolve<DatabaseFacade>(TOKENS.Database);
        const subRepo = new UserSubscriptionRepository(db);

        const subscriptionId = subscription.id;
        const status = subscription.status;
        const currentPeriodEnd = new Date(subscription.current_period_end * 1000);
        const cancelAtPeriodEnd = subscription.cancel_at_period_end;

        console.log(`[StripeWebhook] Subscription updated: ${subscriptionId}, status: ${status}, cancel_at_period_end: ${cancelAtPeriodEnd}`);

        const existingSub = await subRepo.findByMerchantSubscriptionId(subscriptionId);
        if (!existingSub) {
            console.log(`[StripeWebhook] No subscription found for merchant ID ${subscriptionId}`);
            return;
        }

        let newStatus = existingSub.status;
        if (status === 'active') {
            newStatus = cancelAtPeriodEnd ? 'active' : 'active';
        } else if (status === 'past_due') {
            newStatus = 'past_due';
        } else if (status === 'trialing') {
            newStatus = 'trialing';
        } else if (status === 'canceled') {
            newStatus = cancelAtPeriodEnd ? 'active' : 'cancelled';
        } else if (status === 'unpaid') {
            newStatus = 'past_due';
        }

        await subRepo.updateStatusAndPeriod(
            existingSub.id,
            newStatus,
            currentPeriodEnd,
            cancelAtPeriodEnd
        );

        console.log(`[StripeWebhook] Updated subscription ${subscriptionId}: status=${newStatus}, period_end=${currentPeriodEnd.toISOString()}`);
    }

    private async handleSubscriptionDeleted(subscription: any): Promise<void> {
        const db = Container.getInstance().resolve<DatabaseFacade>(TOKENS.Database);
        const subRepo = new UserSubscriptionRepository(db);
        const userRepo = new UserRepository(db);

        const subscriptionId = subscription.id;

        console.log(`[StripeWebhook] Subscription deleted: ${subscriptionId}`);

        const existingSub = await subRepo.findByMerchantSubscriptionId(subscriptionId);
        if (!existingSub) {
            console.log(`[StripeWebhook] No subscription found for merchant ID ${subscriptionId}`);
            return;
        }

        await subRepo.updateStatusAndPeriod(
            existingSub.id,
            'cancelled',
            undefined,
            false
        );

        const user = await userRepo.findById(existingSub.userId);
        if (user) {
            console.log(`[StripeWebhook] Subscription cancelled for user ${user.email}`);
        }

        console.log(`[StripeWebhook] Marked subscription ${subscriptionId} as cancelled`);
    }

    private async sendPaymentFailureEmail(
        email: string,
        userName: string,
        amount: number,
        currency: string
    ): Promise<void> {
        try {
            const { EmailServiceFactory } = await import('@domains/email');
            const { generatePaymentFailureEmailHtml, getPaymentFailureSubject } = await import('@domains/email/EmailTemplates');

            const emailService = EmailServiceFactory.create();

            const html = generatePaymentFailureEmailHtml({
                userName: userName || 'User',
                userEmail: email,
                amount,
                currency,
                planName: 'SpendWise',
                billingUrl: process.env.FRONTEND_URL || 'http://localhost:5173/settings/subscription'
            });

            await emailService.send({
                to: email,
                subject: getPaymentFailureSubject(),
                html
            });

            console.log(`[StripeWebhook] Payment failure email sent to ${email}`);
        } catch (error) {
            console.error(`[StripeWebhook] Failed to send payment failure email:`, error);
        }
    }

    private async downloadAndUploadPdf(pdfUrl: string, invoiceId: string): Promise<string> {
        return new Promise((resolve, reject) => {
            const https = require('https');
            https.get(pdfUrl, (res: any) => {
                if (res.statusCode !== 200) {
                    reject(new Error(`Failed to download PDF: ${res.statusCode}`));
                    return;
                }

                const chunks: Buffer[] = [];
                res.on('data', (chunk: Buffer) => chunks.push(chunk));
                res.on('end', async () => {
                    try {
                        const pdfBuffer = Buffer.concat(chunks);
                        const result = await this.uploadToStorage(pdfBuffer, `${invoiceId}.pdf`, 'application/pdf');
                        resolve(result);
                    } catch (err) {
                        reject(err);
                    }
                });
            }).on('error', reject);
        });
    }

    private async uploadToStorage(buffer: Buffer, filename: string, contentType: string): Promise<string> {
        const storageService = Container.getInstance().resolve<any>('StorageService');
        
        if (!storageService) {
            throw new AppError('StorageService not configured', 500);
        }

        const result = await storageService.upload({
            file: buffer,
            filename,
            contentType,
            bucket: INVOICES_BUCKET,
        });

        return result.url || `${this.config.get('storage.publicUrl')}/${INVOICES_BUCKET}/${filename}`;
    }

    private async createPaymentRecord(db: DatabaseFacade, data: {
        userId: string;
        subscriptionId: string;
        stripeInvoiceId?: string;
        amount: number;
        currency: string;
        status: string;
        type: string;
        invoiceUrl?: string;
        invoicePdf?: string;
    }): Promise<void> {
        await db.query(
            `INSERT INTO payments (
                user_id, subscription_id, stripe_invoice_id,
                amount, currency, status, type, invoice_url, invoice_pdf, created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
            ON CONFLICT (stripe_invoice_id) DO UPDATE SET
                status = EXCLUDED.status, 
                invoice_url = COALESCE(EXCLUDED.invoice_url, payments.invoice_url),
                invoice_pdf = COALESCE(EXCLUDED.invoice_pdf, payments.invoice_pdf),
                updated_at = NOW()`,
            [
                data.userId,
                data.subscriptionId,
                data.stripeInvoiceId,
                data.amount,
                data.currency,
                data.status,
                data.type,
                data.invoiceUrl,
                data.invoicePdf,
            ]
        );
    }
}

let webhookHandlerInstance: StripeWebhookHandler | null = null;

export function getStripeWebhookHandler(): StripeWebhookHandler {
    if (!webhookHandlerInstance) {
        webhookHandlerInstance = new StripeWebhookHandler();
    }
    return webhookHandlerInstance;
}