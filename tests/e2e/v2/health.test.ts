import request from 'supertest';
import { Server } from '@server/Server';
import { ConfigLoader } from '@config/ConfigLoader';

describe('E2E - API v2', () => {
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
        });
    });

    describe('Versioned API', () => {
        it('should reject unknown v2 routes with 404', async () => {
            const response = await request(server.getApp())
                .get('/api/v2/unknown')
                .expect(404);

            expect(response.body).toBeDefined();
        });
    });
});
