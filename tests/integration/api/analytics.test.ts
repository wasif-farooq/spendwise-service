import { describe, it, expect, beforeAll } from '@jest/globals';
import request from 'supertest';
import { getTestApp, getTestUserToken } from '../helpers/auth';

describe('Analytics API', () => {
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

    describe('GET /workspaces/:workspaceId/analytics/overview', () => {
        it('should return analytics overview', async () => {
            if (!testWorkspaceId) return;
            
            const res = await request(app)
                .get(`/api/v1/workspaces/${testWorkspaceId}/analytics/overview`)
                .set('Authorization', `Bearer ${token}`);
            
            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty('data');
        });

        it('should return 401 without auth', async () => {
            if (!testWorkspaceId) return;
            
            const res = await request(app)
                .get(`/api/v1/workspaces/${testWorkspaceId}/analytics/overview`);
            
            expect(res.status).toBe(401);
        });

        it('should filter by period', async () => {
            if (!testWorkspaceId) return;
            
            const res = await request(app)
                .get(`/api/v1/workspaces/${testWorkspaceId}/analytics/overview?period=month`)
                .set('Authorization', `Bearer ${token}`);
            
            expect(res.status).toBe(200);
        });
    });

    describe('GET /workspaces/:workspaceId/analytics/category-trends', () => {
        it('should return category trends', async () => {
            if (!testWorkspaceId) return;
            
            const res = await request(app)
                .get(`/api/v1/workspaces/${testWorkspaceId}/analytics/category-trends`)
                .set('Authorization', `Bearer ${token}`);
            
            expect(res.status).toBe(200);
        });

        it('should filter by months', async () => {
            if (!testWorkspaceId) return;
            
            const res = await request(app)
                .get(`/api/v1/workspaces/${testWorkspaceId}/analytics/category-trends?months=3`)
                .set('Authorization', `Bearer ${token}`);
            
            expect(res.status).toBe(200);
        });
    });

    describe('GET /workspaces/:workspaceId/analytics/comparison', () => {
        it('should return comparison data', async () => {
            if (!testWorkspaceId) return;
            
            const res = await request(app)
                .get(`/api/v1/workspaces/${testWorkspaceId}/analytics/comparison`)
                .set('Authorization', `Bearer ${token}`);
            
            expect(res.status).toBe(200);
        });

        it('should filter by period and months', async () => {
            if (!testWorkspaceId) return;
            
            const res = await request(app)
                .get(`/api/v1/workspaces/${testWorkspaceId}/analytics/comparison?period=month&months=3`)
                .set('Authorization', `Bearer ${token}`);
            
            expect(res.status).toBe(200);
        });
    });

    describe('GET /workspaces/:workspaceId/analytics/spending-trend', () => {
        it('should return spending trend', async () => {
            if (!testWorkspaceId) return;
            
            const res = await request(app)
                .get(`/api/v1/workspaces/${testWorkspaceId}/analytics/spending-trend`)
                .set('Authorization', `Bearer ${token}`);
            
            expect(res.status).toBe(200);
        });

        it('should filter by period', async () => {
            if (!testWorkspaceId) return;
            
            const res = await request(app)
                .get(`/api/v1/workspaces/${testWorkspaceId}/analytics/spending-trend?period=week`)
                .set('Authorization', `Bearer ${token}`);
            
            expect(res.status).toBe(200);
        });

        it('should filter by accountId', async () => {
            if (!testWorkspaceId) return;
            
            const accountsRes = await request(app)
                .get(`/api/v1/workspaces/${testWorkspaceId}/accounts`)
                .set('Authorization', `Bearer ${token}`);
            
            if (accountsRes.body.data && accountsRes.body.data.length > 0) {
                const accountId = accountsRes.body.data[0].id;
                
                const res = await request(app)
                    .get(`/api/v1/workspaces/${testWorkspaceId}/analytics/spending-trend?accountId=${accountId}`)
                    .set('Authorization', `Bearer ${token}`);
                
                expect(res.status).toBe(200);
            }
        });
    });

    describe('GET /workspaces/:workspaceId/analytics/top-merchants', () => {
        it('should return top merchants', async () => {
            if (!testWorkspaceId) return;
            
            const res = await request(app)
                .get(`/api/v1/workspaces/${testWorkspaceId}/analytics/top-merchants`)
                .set('Authorization', `Bearer ${token}`);
            
            expect(res.status).toBe(200);
        });

        it('should filter by months and limit', async () => {
            if (!testWorkspaceId) return;
            
            const res = await request(app)
                .get(`/api/v1/workspaces/${testWorkspaceId}/analytics/top-merchants?months=3&limit=10`)
                .set('Authorization', `Bearer ${token}`);
            
            expect(res.status).toBe(200);
        });
    });
});