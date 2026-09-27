import { ConfigLoader } from '@config/ConfigLoader';
import { DatabaseFacade } from '@facades/DatabaseFacade';
import { RepositoryFactory } from '@factories/RepositoryFactory';
import { ServiceFactory } from '@factories/ServiceFactory';
import { PaymentService } from '../services/PaymentService';
import { Container } from '@di/Container';
import { TOKENS } from '@di/tokens';
import { AppError } from '@shared/errors/AppError';
import { PaddleGateway } from '../services/PaddleGateway';
import { PaddleBillingService } from '../services/PaddleBillingService';
import { PAYMENT_PROVIDER_FLAGS } from '../interfaces/IPaymentGateway';

export class PaymentRequestRepository {
  private config = ConfigLoader.getInstance();
  private cachedService: PaymentService | null = null;

  private getMode(): string {
    return this.config.get('repository.mode') || 'direct';
  }

  private getService(): PaymentService {
    if (this.cachedService) {
      return this.cachedService;
    }

    this.cachedService = PaymentService.getInstance();
    return this.cachedService;
  }

  private wrap(promise: Promise<any>): Promise<any> {
    return promise
      .then((data) => ({ data, error: null, statusCode: 200 }))
      .catch((error) => ({
        error: error.message || 'An error occurred',
        statusCode: error.statusCode || 500,
        data: null,
      }));
  }

  async getGateways() {
    if (this.getMode() === 'direct') {
      const service = this.getService();
      const featureFlagService = Container.getInstance().resolve<any>(TOKENS.FeatureFlagService);

      const gateways = [];
      const stripeEnabled = await featureFlagService.isEnabled('paymentStripe');
      const lemonSqueezyEnabled = await featureFlagService.isEnabled('paymentLemonSqueezy');
      const twoCheckoutEnabled = await featureFlagService.isEnabled('paymentTwoCheckout');

      if (stripeEnabled) {
        gateways.push({ id: 'stripe', name: 'Stripe', enabled: true });
      }
      if (lemonSqueezyEnabled) {
        gateways.push({ id: 'lemonsqueezy', name: 'Lemon Squeezy', enabled: true });
      }
      if (twoCheckoutEnabled) {
        gateways.push({ id: 'twocheckout', name: '2Checkout', enabled: true });
      }
      // Only offered when it can actually take a payment: flag on AND credentials present.
      if (
        (await featureFlagService.isEnabled(PAYMENT_PROVIDER_FLAGS.paddle)) &&
        service.getAvailableProviders().includes('paddle')
      ) {
        gateways.push({ id: 'paddle', name: 'Paddle', enabled: true });
      }

      return { data: gateways, error: null, statusCode: 200 };
    }
    throw new Error('RPC mode not implemented');
  }

  async createCheckout(
    userId: string,
    data: { planId: string; billingPeriod: string; paymentGateway: string },
  ) {
    if (this.getMode() === 'direct') {
      const service = this.getService();
      const db = Container.getInstance().resolve<DatabaseFacade>(TOKENS.Database);
      const repoFactory = new RepositoryFactory(db);

      const userRepo = repoFactory.createUserRepository();
      const user = await userRepo.findById(userId);

      if (!user) {
        throw new Error('User not found');
      }

      const planRepo = repoFactory.createSubscriptionPlanRepository();
      const plan = await planRepo.findById(data.planId);

      if (!plan) {
        throw new Error('Plan not found');
      }

      const price = data.billingPeriod === 'yearly' ? plan.yearlyPrice : plan.price;

      const checkoutSession = await service.createCheckoutSession({
        planId: plan.id,
        planPrice: price,
        planName: plan.name,
        billingPeriod: data.billingPeriod as 'monthly' | 'yearly',
        customer: {
          email: user.email,
          name: `${user.firstName} ${user.lastName}`.trim() || user.email,
        },
        successUrl: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/checkout/success?session_id={sessionId}`,
        cancelUrl: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/checkout/cancel?planId=${data.planId}`,
        provider: data.paymentGateway as any,
        userId: userId,
        currency: plan.currency,
      });

      return this.wrap(
        Promise.resolve({
          checkoutUrl: checkoutSession.url,
          sessionId: checkoutSession.sessionId,
          // Overlay providers (Paddle) — the browser opens the checkout itself.
          ...(checkoutSession.provider && { provider: checkoutSession.provider }),
          ...(checkoutSession.transactionId && { transactionId: checkoutSession.transactionId }),
          ...(checkoutSession.clientToken && { clientToken: checkoutSession.clientToken }),
          ...(checkoutSession.environment && { environment: checkoutSession.environment }),
        }),
      );
    }
    throw new Error('RPC mode not implemented');
  }

  /**
   * Browser-side confirmation of a Paddle checkout. Not feature-flag gated on purpose: a
   * customer who has already paid must be able to get their plan even if the gateway was
   * switched off in the meantime.
   */
  async confirmPaddleTransaction(userId: string, transactionId: string) {
    if (this.getMode() !== 'direct') throw new Error('RPC mode not implemented');

    let gateway: PaddleGateway;
    try {
      gateway = this.getService().getGateway('paddle') as PaddleGateway;
    } catch {
      throw new AppError('Paddle is not configured', 503);
    }
    const db = Container.getInstance().resolve<DatabaseFacade>(TOKENS.Database);
    return new PaddleBillingService(gateway, db).confirmTransaction(userId, transactionId);
  }
}
