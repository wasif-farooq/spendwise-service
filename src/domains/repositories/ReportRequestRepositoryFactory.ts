import { ReportRequestRepository } from './ReportRequestRepository';

export class ReportRequestRepositoryFactory {
    private static instance: ReportRequestRepository | null = null;

    create(): ReportRequestRepository {
        if (ReportRequestRepositoryFactory.instance) {
            return ReportRequestRepositoryFactory.instance;
        }

        ReportRequestRepositoryFactory.instance = new ReportRequestRepository();
        return ReportRequestRepositoryFactory.instance;
    }
}