import { ReportController } from '@domains/reports/controllers/ReportController';
import { ReportRequestRepository } from '@domains/repositories/ReportRequestRepository';

export class ReportControllerFactory {
    private reportRequestRepository: ReportRequestRepository;

    constructor() {
        this.reportRequestRepository = new ReportRequestRepository();
    }

    create(): ReportController {
        return new ReportController(this.reportRequestRepository);
    }
}