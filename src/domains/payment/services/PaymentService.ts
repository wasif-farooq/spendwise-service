import {
  IPaymentGateway,
  PaymentProvider,
  PaymentCustomer,
  CheckoutSession,
  SubscriptionDetails,
  PAYMENT_PROVIDER_FLAGS,
} from '../interfaces/IPaymentGateway';
import { StripeGateway } from './StripeGateway';
import { LemonSqueezyGateway } from './LemonSqueezyGateway';
import { TwoCheckoutGateway } from './TwoCheckoutGateway';
import { PaddleGateway } from './PaddleGateway';
import { AppError } from '@shared/errors/AppError';
import { Container } from '@di/Container';
import { TOKENS } from '@di/tokens';

export class PaymentService {
  private static instance: PaymentService;
  private gateways: Map<PaymentProvider, IPaymentGateway> = new Map();
  private initialized = false;

  private constructor() {
    this.initializeGateways();
  }

  static getInstance(): PaymentService {
    if (!PaymentService.instance) {
      PaymentService.instance = new PaymentService();
    }
    return PaymentService.instance;
  }

  private initializeGateways(): void {
    if (this.initialized) return;

    console.log('[PaymentService] Initializing payment gateways...');

    try {
      const stripe = new StripeGateway();
      this.gateways.set('stripe', stripe);
      console.log('[PaymentService] Stripe gateway initialized successfully');
    } catch (error) {
      console.log(
        '[PaymentService] Stripe gateway not available:',
        (error as Error).message,
        (error as Error).stack,
      );
    }

    try {
      this.gateways.set('lemonsqueezy', new LemonSqueezyGateway());
    } catch (error) {
      console.log('[PaymentService] LemonSqueezy gateway not available:', (error as Error).message);
    }

    try {
      this.gateways.set('twocheckout', new TwoCheckoutGateway());
    } catch (error) {
      console.log('[PaymentService] 2Checkout gateway not available:', (error as Error).message);
    }

    try {
      this.gateways.set('paddle', new PaddleGateway());
    } catch (error) {
      console.log('[PaymentService] Paddle gateway not available:', (error as Error).message);
    }

    console.log('[PaymentService] Available gateways:', Array.from(this.gateways.keys()));
    this.initialized = true;
  }

  getGateway(provider: PaymentProvider): IPaymentGateway {
    let gateway = this.gateways.get(provider);

    if (!gateway) {
      console.log(
        `[PaymentService] Gateway '${provider}' not in cache, attempting to initialize...`,
      );

      if (provider === 'stripe') {
        try {
          gateway = new StripeGateway();
          this.gateways.set('stripe', gateway);
          console.log(`[PaymentService] Stripe gateway initialized on-demand`);
        } catch (error) {
          console.log(
            `[PaymentService] On-demand Stripe initialization failed:`,
            (error as Error).message,
          );
        }
      } else if (provider === 'paddle') {
        try {
          gateway = new PaddleGateway();
          this.gateways.set('paddle', gateway);
        } catch (error) {
          console.log(
            `[PaymentService] On-demand Paddle initialization failed:`,
            (error as Error).message,
          );
        }
      }
    }

    if (!gateway) {
      throw new Error(`Payment gateway '${provider}' is not available`);
    }
    return gateway;
  }

  async getActiveGateway(): Promise<IPaymentGateway> {
    const featureFlagService = Container.getInstance().resolve<any>(TOKENS.FeatureFlagService);

    const enabledProviders: PaymentProvider[] = [];

    if (await featureFlagService.isEnabled('paymentStripe')) {
      if (this.gateways.has('stripe')) enabledProviders.push('stripe');
    }
    if (await featureFlagService.isEnabled('paymentLemonSqueezy')) {
      if (this.gateways.has('lemonsqueezy')) enabledProviders.push('lemonsqueezy');
    }
    if (await featureFlagService.isEnabled('paymentTwoCheckout')) {
      if (this.gateways.has('twocheckout')) enabledProviders.push('twocheckout');
    }
    if (await featureFlagService.isEnabled(PAYMENT_PROVIDER_FLAGS.paddle)) {
      if (this.gateways.has('paddle')) enabledProviders.push('paddle');
    }

    if (enabledProviders.length === 0) {
      throw new Error('No payment gateways are currently available');
    }

    return this.getGateway(enabledProviders[0]);
  }

  async createCheckoutSession(params: {
    planId: string;
    planPrice: number;
    planName: string;
    billingPeriod: 'monthly' | 'yearly';
    customer: PaymentCustomer;
    successUrl: string;
    cancelUrl: string;
    provider?: PaymentProvider;
    userId?: string;
    currency?: string;
  }): Promise<CheckoutSession> {
    if (params.provider) {
      await this.assertProviderEnabled(params.provider);
    }
    const gateway = params.provider
      ? this.getGateway(params.provider)
      : await this.getActiveGateway();

    return gateway.createCheckoutSession({
      planId: params.planId,
      planPrice: params.planPrice,
      planName: params.planName,
      billingPeriod: params.billingPeriod,
      customer: params.customer,
      successUrl: params.successUrl,
      cancelUrl: params.cancelUrl,
      userId: params.userId,
      currency: params.currency,
    });
  }

  /**
   * A client-chosen provider must still be switched on. Without this a user could POST
   * paymentGateway=<anything configured> and bypass the feature flag entirely.
   */
  async assertProviderEnabled(provider: PaymentProvider): Promise<void> {
    const flag = PAYMENT_PROVIDER_FLAGS[provider];
    if (!flag) {
      throw new AppError(`Unknown payment gateway '${provider}'`, 400);
    }
    const featureFlagService = Container.getInstance().resolve<any>(TOKENS.FeatureFlagService);
    if (!(await featureFlagService.isEnabled(flag))) {
      throw new AppError(`Payment gateway '${provider}' is not enabled`, 400);
    }
  }

  async getSubscriptionDetails(
    subscriptionId: string,
    provider: PaymentProvider,
  ): Promise<SubscriptionDetails> {
    const gateway = this.getGateway(provider);
    return gateway.getSubscriptionDetails(subscriptionId);
  }

  async cancelSubscription(
    subscriptionId: string,
    provider: PaymentProvider,
    cancelAtPeriodEnd: boolean = true,
  ): Promise<void> {
    const gateway = this.getGateway(provider);
    return gateway.cancelSubscription(subscriptionId, cancelAtPeriodEnd);
  }

  getAvailableProviders(): PaymentProvider[] {
    return Array.from(this.gateways.keys());
  }
}

export async function getPaymentGateway(): Promise<IPaymentGateway> {
  return PaymentService.getInstance().getActiveGateway();
}
