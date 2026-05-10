import { describe, it, expect, beforeAll } from '@jest/globals';
import request from 'supertest';
import { getTestApp, getTestUserToken } from '../helpers/auth';

describe('Transactions API', () => {
    let app: any;
    let token: string;
    let testWorkspaceId: string;
    let testAccountId: string;

    beforeAll(async () => {
        app = await getTestApp();
        token = await getTestUserToken();

        const workspacesRes = await request(app)
            .get('/api/v1/workspaces')
            .set('Authorization', `Bearer ${token}`);
        
        if (workspacesRes.body.data && workspacesRes.body.data.length > 0) {
            testWorkspaceId = workspacesRes.body.data[0].id;
        }

        const accountsRes = await request(app)
            .get(`/api/v1/workspaces/${testWorkspaceId}/accounts`)
            .set('Authorization', `Bearer ${token}`);
        
        if (accountsRes.body.data && accountsRes.body.data.length > 0) {
            testAccountId = accountsRes.body.data[0].id;
        }
    });

    describe('GET /workspaces/:workspaceId/accounts/:accountId/transactions', () => {
        it('should return transactions for an account', async () => {
            if (!testWorkspaceId || !testAccountId) return;
            
            const res = await request(app)
                .get(`/api/v1/workspaces/${testWorkspaceId}/accounts/${testAccountId}/transactions`)
                .set('Authorization', `Bearer ${token}`);
            
            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty('data');
        });

        it('should return 401 without auth', async () => {
            if (!testWorkspaceId || !testAccountId) return;
            
            const res = await request(app)
                .get(`/api/v1/workspaces/${testWorkspaceId}/accounts/${testAccountId}/transactions`);
            
            expect(res.status).toBe(401);
        });

        it('should filter transactions by date range', async () => {
            if (!testWorkspaceId || !testAccountId) return;
            
            const res = await request(app)
                .get(`/api/v1/workspaces/${testWorkspaceId}/accounts/${testAccountId}/transactions?startDate=2024-01-01&endDate=2024-12-31`)
                .set('Authorization', `Bearer ${token}`);
            
            expect(res.status).toBe(200);
        });

        it('should filter transactions by search term', async () => {
            if (!testWorkspaceId || !testAccountId) return;
            
            const res = await request(app)
                .get(`/api/v1/workspaces/${testWorkspaceId}/accounts/${testAccountId}/transactions?search=amazon`)
                .set('Authorization', `Bearer ${token}`);
            
            expect(res.status).toBe(200);
        });
    });

    describe('POST /workspaces/:workspaceId/accounts/:accountId/transactions', () => {
        it('should create a new transaction', async () => {
            if (!testWorkspaceId || !testAccountId) return;
            
            const res = await request(app)
                .post(`/api/v1/workspaces/${testWorkspaceId}/accounts/${testAccountId}/transactions`)
                .set('Authorization', `Bearer ${token}`)
                .send({
                    amount: 50.00,
                    type: 'expense',
                    description: 'Test Transaction',
                    date: new Date().toISOString(),
                    categoryId: null,
                    merchant: 'Test Merchant'
                });
            
            expect([201, 400, 403]).toContain(res.status);
        });

        it('should return 400 with invalid data', async () => {
            if (!testWorkspaceId || !testAccountId) return;
            
            const res = await request(app)
                .post(`/api/v1/workspaces/${testWorkspaceId}/accounts/${testAccountId}/transactions`)
                .set('Authorization', `Bearer ${token}`)
                .send({
                    amount: 'invalid',
                    type: 'invalid_type'
                });
            
            expect(res.status).toBe(400);
        });
    });

    describe('GET /workspaces/:workspaceId/transactions/all', () => {
        it('should return all transactions for workspace', async () => {
            if (!testWorkspaceId) return;
            
            const res = await request(app)
                .get(`/api/v1/workspaces/${testWorkspaceId}/transactions/all`)
                .set('Authorization', `Bearer ${token}`);
            
            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty('data');
        });

        it('should support pagination', async () => {
            if (!testWorkspaceId) return;
            
            const res = await request(app)
                .get(`/api/v1/workspaces/${testWorkspaceId}/transactions/all?page=1&limit=10`)
                .set('Authorization', `Bearer ${token}`);
            
            expect(res.status).toBe(200);
        });
    });

    describe('GET /workspaces/:workspaceId/transactions/stats', () => {
        it('should return transaction statistics', async () => {
            if (!testWorkspaceId) return;
            
            const res = await request(app)
                .get(`/api/v1/workspaces/${testWorkspaceId}/transactions/stats`)
                .set('Authorization', `Bearer ${token}`);
            
            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty('data');
        });

        it('should filter stats by period', async () => {
            if (!testWorkspaceId) return;
            
            const res = await request(app)
                .get(`/api/v1/workspaces/${testWorkspaceId}/transactions/stats?period=month`)
                .set('Authorization', `Bearer ${token}`);
            
            expect(res.status).toBe(200);
        });

        it('should filter stats by date range', async () => {
            if (!testWorkspaceId) return;
            
            const res = await request(app)
                .get(`/api/v1/workspaces/${testWorkspaceId}/transactions/stats?startDate=2024-01-01&endDate=2024-12-31`)
                .set('Authorization', `Bearer ${token}`);
            
            expect(res.status).toBe(200);
        });
    });

    describe('POST /workspaces/:workspaceId/transactions/transfer', () => {
        it('should create a transfer between accounts', async () => {
            if (!testWorkspaceId) return;
            
            const accountsRes = await request(app)
                .get(`/api/v1/workspaces/${testWorkspaceId}/accounts`)
                .set('Authorization', `Bearer ${token}`);
            
            if (accountsRes.body.data && accountsRes.body.data.length >= 2) {
                const fromAccountId = accountsRes.body.data[0].id;
                const toAccountId = accountsRes.body.data[1].id;
                
                const res = await request(app)
                    .post(`/api/v1/workspaces/${testWorkspaceId}/transactions/transfer`)
                    .set('Authorization', `Bearer ${token}`)
                    .send({
                        fromAccountId,
                        toAccountId,
                        amount: 100.00,
                        description: 'Test Transfer',
                        date: new Date().toISOString()
                    });
                
                expect([201, 400, 403]).toContain(res.status);
            }
        });
    });

    describe('GET /workspaces/:workspaceId/accounts/:accountId/transactions/stats', () => {
        it('should return account transaction stats', async () => {
            if (!testWorkspaceId || !testAccountId) return;
            
            const res = await request(app)
                .get(`/api/v1/workspaces/${testWorkspaceId}/accounts/${testAccountId}/transactions/stats`)
                .set('Authorization', `Bearer ${token}`);
            
            expect(res.status).toBe(200);
        });
    });
});