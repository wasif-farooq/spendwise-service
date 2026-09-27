import { Request, Response } from 'express';
import { PaymentRequestRepository } from '../repositories/PaymentRequestRepository';

export class PaymentController {
  constructor(private paymentRequestRepository: PaymentRequestRepository) {}

  private getUserId(req: Request): string {
    return (req as any).user?.userId || (req as any).user?.id || (req as any).user?.sub;
  }

  async getGateways(req: Request, res: Response) {
    try {
      const result = await this.paymentRequestRepository.getGateways();

      if (result.error) {
        throw new Error(result.error);
      }

      return res.json({ gateways: result.data });
    } catch (error: any) {
      console.error('[PaymentController] getGateways error:', error);
      return res.status(500).json({ message: error.message });
    }
  }

  async createCheckout(req: Request, res: Response) {
    try {
      const userId = this.getUserId(req);
      if (!userId) {
        return res.status(401).json({ message: 'User not authenticated' });
      }

      const { planId, billingPeriod, paymentGateway } = req.body;

      if (!planId || !billingPeriod || !paymentGateway) {
        return res
          .status(400)
          .json({ message: 'Missing required fields: planId, billingPeriod, paymentGateway' });
      }

      const result = await this.paymentRequestRepository.createCheckout(userId, {
        planId,
        billingPeriod,
        paymentGateway,
      });

      if (result.error) {
        throw new Error(result.error);
      }

      return res.json(result.data);
    } catch (error: any) {
      console.error('[PaymentController] createCheckout error:', error?.message);
      return res.status(error?.statusCode || 500).json({ message: error.message });
    }
  }

  /** POST /payment/paddle/confirm { transactionId } */
  async confirmPaddle(req: Request, res: Response) {
    try {
      const userId = this.getUserId(req);
      if (!userId) {
        return res.status(401).json({ message: 'User not authenticated' });
      }

      const transactionId = req.body?.transactionId;
      if (typeof transactionId !== 'string' || !transactionId) {
        return res.status(400).json({ message: 'Missing required field: transactionId' });
      }

      const result = await this.paymentRequestRepository.confirmPaddleTransaction(
        userId,
        transactionId,
      );
      // 202 while Paddle is still settling, so clients know to ask again.
      return res.status(result.status === 'pending' ? 202 : 200).json(result);
    } catch (error: any) {
      console.error('[PaymentController] confirmPaddle error:', error?.message);
      return res.status(error?.statusCode || 500).json({ message: error.message });
    }
  }
}
