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

        console.log(`[StripeWebhook] Checkout session completed:`, {
            customerId,
            subscriptionId,
            userId,
            planId,
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
        if (existingSub) {
            await subRepo.update(existingSub.id, {
                planId: planId,
                status: 'active',
                merchantSubscriptionId: subscriptionId,
                paymentProvider: 'stripe',
            });
            console.log(`[StripeWebhook] Updated subscription for user ${userId} to plan ${planId}`);
        } else {
            await subRepo.create({
                userId,
                planId: planId,
                status: 'active',
                merchantSubscriptionId: subscriptionId,
                paymentProvider: 'stripe',
            });
            console.log(`[StripeWebhook] Created subscription for user ${userId} with plan ${planId}`);
        }

        console.log(`[StripeWebhook] Checkout completed for user ${userId}`);
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

        const existingSub = await subRepo.findByUserId(invoice.metadata?.userId);
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

            console.log(`[StripeWebhook] Invoice payment succeeded`);
        }
    }

    private async handleInvoicePaymentFailed(invoice: any): Promise<void> {
        console.log(`[StripeWebhook] Invoice payment failed: ${invoice.id}`);
    }

    private async handleSubscriptionUpdated(subscription: any): Promise<void> {
        console.log(`[StripeWebhook] Subscription updated: ${subscription.id}`);
    }

    private async handleSubscriptionDeleted(subscription: any): Promise<void> {
        console.log(`[StripeWebhook] Subscription deleted: ${subscription.id}`);
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
                status = $6, updated_at = NOW()`,
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