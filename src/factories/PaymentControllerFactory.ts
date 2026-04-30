import { Container } from '@di/Container';
import { PaymentController } from '@domains/payment/controllers/PaymentController';
import { PaymentRequestRepositoryFactory } from '@domains/payment/repositories/PaymentRequestRepositoryFactory';

export class PaymentControllerFactory {
    private static instance: PaymentController | null = null;

    create(): PaymentController {
        if (PaymentControllerFactory.instance) {
            return PaymentControllerFactory.instance;
        }

        const paymentRequestRepoFactory = Container.getInstance()
            .resolve<PaymentRequestRepositoryFactory>('PaymentRequestRepositoryFactory');

        const paymentRequestRepository = paymentRequestRepoFactory.create();

        PaymentControllerFactory.instance = new PaymentController(paymentRequestRepository);

        return PaymentControllerFactory.instance;
    }
}