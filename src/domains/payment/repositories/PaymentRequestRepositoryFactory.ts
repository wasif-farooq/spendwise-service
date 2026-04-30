import { PaymentRequestRepository } from './PaymentRequestRepository';

export class PaymentRequestRepositoryFactory {
    private static instance: PaymentRequestRepository | null = null;

    create(): PaymentRequestRepository {
        if (PaymentRequestRepositoryFactory.instance) {
            return PaymentRequestRepositoryFactory.instance;
        }

        PaymentRequestRepositoryFactory.instance = new PaymentRequestRepository();
        return PaymentRequestRepositoryFactory.instance;
    }
}