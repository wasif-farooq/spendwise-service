import { describe, it, expect, beforeAll } from '@jest/globals';
import request from 'supertest';
import { Container } from '../../../src/core/di/Container';
import { TOKENS } from '../../../src/core/di/tokens';
import { FeatureFlagService } from '../../../src/modules/feature-flags/services/FeatureFlagService';
import { FeatureFlagRequestRepository } from '../../../src/api/v1/modules/feature-flags/repositories/FeatureFlagRequestRepository';
import { FeatureFlagControllerFactory } from '../../../src/core/application/factories/FeatureFlagControllerFactory';
import { RepositoryFactory } from '../../../src/core/application/factories/RepositoryFactory';

// Mock Repository to bypass Kafka and call Service directly
class MockFeatureFlagRequestRepository extends FeatureFlagRequestRepository {
    constructor(private service: FeatureFlagService) {
        super(false);
    }

    async getAllFlags() {
        try {
            return await this.service.getAllFlags();
        } catch (err: any) {
            return { error: err.message, statusCode: 500 };
        }
    }
}

describe('Feature Flags Integration', () => {
    let app: any;
    let service: FeatureFlagService;

    beforeAll(async () => {
        const container = Container.getInstance();

        // Ensure RepositoryFactory is set up (it uses Real Database via ServiceBootstrap usually, 
        // but here we might need to rely on what setup.ts does or manually resolve)
        // setup.ts usually initializes the container.

        service = container.resolve<FeatureFlagService>(TOKENS.FeatureFlagService);

        const mockRepo = new MockFeatureFlagRequestRepository(service);

        // Mock the ControllerFactory
        const originalFactory = container.resolve<FeatureFlagControllerFactory>(TOKENS.FeatureFlagControllerFactory);
        const mockFactory = {
            create: () => new (require('../../../src/api/v1/modules/feature-flags/controllers/FeatureFlagController').FeatureFlagController)(mockRepo)
        };

        container.registerInstance(TOKENS.FeatureFlagControllerFactory, mockFactory);

        const { Server } = await import('../../../src/server/Server');
        const server = new Server();
        app = server.getApp();
    });

    it('should list all feature flags', async () => {
        const res = await request(app).get('/api/v1/feature-flags');

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('new_dashboard_enabled');
        expect(res.body).toHaveProperty('beta_features_enabled');
        expect(res.body.new_dashboard_enabled).toBe(true);
    });
});
