import { ConfigLoader } from '@config/ConfigLoader';
import { DatabaseFacade } from '@facades/DatabaseFacade';
import { RepositoryFactory } from '@factories/RepositoryFactory';
import { ServiceFactory } from '@factories/ServiceFactory';
import { ReportService } from '@domains/reports/services/ReportService';
import { Container } from '@di/Container';
import { TOKENS } from '@di/tokens';

export class ReportRequestRepository {
    private config = ConfigLoader.getInstance();
    private cachedService!: ReportService;

    private getMode(): string {
        return this.config.get('repository.mode') || 'direct';
    }

    private getService(): ReportService {
        if (this.cachedService) {
            return this.cachedService;
        }

        const db = Container.getInstance().resolve<DatabaseFacade>(TOKENS.Database);
        const repoFactory = new RepositoryFactory(db);
        const serviceFactory = new ServiceFactory(repoFactory, db);

        this.cachedService = serviceFactory.createReportService();
        return this.cachedService;
    }

    private wrap(promise: Promise<any>): Promise<any> {
        return promise
            .then(data => ({ data, error: null, statusCode: 200 }))
            .catch(error => ({
                error: error.message || 'An error occurred',
                statusCode: error.statusCode || 500,
                data: null
            }));
    }

    async exportReport(workspaceId: string, userEmail: string, data: {
        dateRange?: 'last7days' | 'last30days' | 'thisMonth' | 'lastMonth' | 'thisYear' | 'lastYear' | 'custom';
        customDates?: { startDate: string; endDate: string };
        format: 'csv' | 'xlsx';
        userId?: string;
    }) {
        if (this.getMode() === 'direct') {
            const service = this.getService();
            return this.wrap(service.handleExportRequest({
                workspaceId,
                userId: data.userId || '',
                userEmail,
                dateRange: data.dateRange || 'thisMonth',
                customDates: data.customDates,
                format: data.format
            }));
        }
        throw new Error('RPC mode not implemented');
    }
}