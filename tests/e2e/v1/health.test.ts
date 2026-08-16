import request from 'supertest';
import { Server } from '@server/Server';
import { ConfigLoader } from '@config/ConfigLoader';

describe('E2E - API v1', () => {
    let server: Server;

    beforeAll(() => {
        ConfigLoader.getInstance();
        server = new Server();
    });

    describe('Health Check', () => {
        it('should return 200 with status ok', async () => {
            const response = await request(server.getApp())
                .get('/health')
                .expect(200);

            expect(response.body.status).toBe('ok');
            expect(response.body.service).toBe('API Gateway');
            expect(response.body.timestamp).toBeDefined();
        });
    });

    describe('Metrics Endpoint', () => {
        it('should return metrics with 200', async () => {
            const response = await request(server.getApp())
                .get('/metrics')
                .expect(200);

            expect(response.text).toBeDefined();
            expect(response.header['content-type']).toContain('text/plain');
        });
    });

    describe('Versioned API', () => {
        it('should reject requests without valid API version', async () => {
            const response = await request(server.getApp())
                .get('/api/unknown')
                .expect(404);

            expect(response.body).toBeDefined();
        });
    });
});
