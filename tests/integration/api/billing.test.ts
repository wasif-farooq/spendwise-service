import { describe, it, expect, beforeAll } from '@jest/globals';
import request from 'supertest';
import { getTestApp, getTestUserToken } from '../helpers/auth';

describe('Billing API', () => {
    let app: any;
    let token: string;

    beforeAll(async () => {
        app = await getTestApp();
        token = await getTestUserToken();
    });

    describe('GET /billing', () => {
        it('should return billing data', async () => {
            const res = await request(app)
                .get('/api/v1/billing')
                .set('Authorization', `Bearer ${token}`);
            
            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty('data');
        });

        it('should return 401 without auth', async () => {
            const res = await request(app)
                .get('/api/v1/billing');
            
            expect(res.status).toBe(401);
        });
    });

    describe('GET /billing/history', () => {
        it('should return billing history', async () => {
            const res = await request(app)
                .get('/api/v1/billing/history?limit=10&offset=0')
                .set('Authorization', `Bearer ${token}`);
            
            expect(res.status).toBe(200);
        });

        it('should support pagination', async () => {
            const res = await request(app)
                .get('/api/v1/billing/history?limit=5&offset=5')
                .set('Authorization', `Bearer ${token}`);
            
            expect(res.status).toBe(200);
        });
    });

    describe('GET /billing/plan', () => {
        it('should return current plan', async () => {
            const res = await request(app)
                .get('/api/v1/billing/plan')
                .set('Authorization', `Bearer ${token}`);
            
            expect(res.status).toBe(200);
        });
    });

    describe('POST /billing/validate-promo', () => {
        it('should validate promo code', async () => {
            const res = await request(app)
                .post('/api/v1/billing/validate-promo')
                .set('Authorization', `Bearer ${token}`)
                .send({ code: 'TESTCODE' });
            
            expect([200, 404]).toContain(res.status);
        });
    });

    describe('POST /billing/change-plan', () => {
        it('should return error for invalid plan', async () => {
            const res = await request(app)
                .post('/api/v1/billing/change-plan')
                .set('Authorization', `Bearer ${token}`)
                .send({ planId: 'invalid-id' });
            
            expect([400, 404]).toContain(res.status);
        });
    });

    describe('POST /billing/cancel', () => {
        it('should handle cancel subscription', async () => {
            const res = await request(app)
                .post('/api/v1/billing/cancel')
                .set('Authorization', `Bearer ${token}`);
            
            expect([200, 400, 404]).toContain(res.status);
        });
    });
});

describe('Subscription API', () => {
    let app: any;
    let token: string;
    let testWorkspaceId: string;

    beforeAll(async () => {
        app = await getTestApp();
        token = await getTestUserToken();

        const workspacesRes = await request(app)
            .get('/api/v1/workspaces')
            .set('Authorization', `Bearer ${token}`);
        
        if (workspacesRes.body.data && workspacesRes.body.data.length > 0) {
            testWorkspaceId = workspacesRes.body.data[0].id;
        }
    });

    describe('GET /subscription/plans', () => {
        it('should return available plans', async () => {
            const res = await request(app)
                .get('/api/v1/subscription/plans');
            
            expect(res.status).toBe(200);
        });
    });

    describe('GET /subscription/current', () => {
        it('should return current subscription', async () => {
            const res = await request(app)
                .get('/api/v1/subscription/current')
                .set('Authorization', `Bearer ${token}`);
            
            expect(res.status).toBe(200);
        });

        it('should return 401 without auth', async () => {
            const res = await request(app)
                .get('/api/v1/subscription/current');
            
            expect(res.status).toBe(401);
        });
    });

    describe('GET /subscription/workspace/:workspaceId/current', () => {
        it('should return workspace subscription', async () => {
            if (!testWorkspaceId) return;
            
            const res = await request(app)
                .get(`/api/v1/subscription/workspace/${testWorkspaceId}/current`)
                .set('Authorization', `Bearer ${token}`);
            
            expect(res.status).toBe(200);
        });
    });

    describe('GET /subscription/usage', () => {
        it('should return feature usage', async () => {
            const res = await request(app)
                .get('/api/v1/subscription/usage')
                .set('Authorization', `Bearer ${token}`);
            
            expect(res.status).toBe(200);
        });
    });

    describe('GET /subscription/check-access/:feature', () => {
        it('should check feature access', async () => {
            const res = await request(app)
                .get('/api/v1/subscription/check-access/unlimited_transactions')
                .set('Authorization', `Bearer ${token}`);
            
            expect(res.status).toBe(200);
        });
    });

    describe('POST /subscription/upgrade', () => {
        it('should return error for invalid plan', async () => {
            const res = await request(app)
                .post('/api/v1/subscription/upgrade')
                .set('Authorization', `Bearer ${token}`)
                .send({ planId: 'invalid-id' });
            
            expect([400, 404]).toContain(res.status);
        });
    });

    describe('POST /subscription/downgrade', () => {
        it('should handle downgrade request', async () => {
            const res = await request(app)
                .post('/api/v1/subscription/downgrade')
                .set('Authorization', `Bearer ${token}`)
                .send({ planId: 'free' });
            
            expect([200, 400, 404]).toContain(res.status);
        });
    });
});