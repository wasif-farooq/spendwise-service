import { PaymentController } from '@domains/payment/controllers/PaymentController';
import { PaymentRequestRepository } from '@domains/payment/repositories/PaymentRequestRepository';

export class PaymentControllerFactory {
    private paymentRequestRepository: PaymentRequestRepository;

    constructor() {
        this.paymentRequestRepository = new PaymentRequestRepository();
    }

    create(): PaymentController {
        return new PaymentController(this.paymentRequestRepository);
    }
}