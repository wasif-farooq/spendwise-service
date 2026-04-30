import { Container } from '@di/Container';
import { ReportController } from '@domains/reports/controllers/ReportController';
import { ReportRequestRepositoryFactory } from '@domains/repositories/ReportRequestRepositoryFactory';

export class ReportControllerFactory {
    private static instance: ReportController | null = null;

    create(): ReportController {
        if (ReportControllerFactory.instance) {
            return ReportControllerFactory.instance;
        }

        const reportRequestRepoFactory = Container.getInstance()
            .resolve<ReportRequestRepositoryFactory>('ReportRequestRepositoryFactory');

        const reportRequestRepository = reportRequestRepoFactory.create();

        ReportControllerFactory.instance = new ReportController(reportRequestRepository);

        return ReportControllerFactory.instance;
    }
}