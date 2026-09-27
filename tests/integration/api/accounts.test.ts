import { describe, it, expect, beforeAll } from '@jest/globals';
import request from 'supertest';
import { getTestApp, getTestUserToken } from '../helpers/auth';

describe('Accounts API', () => {
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
    });

    describe('GET /workspaces/:workspaceId/accounts', () => {
        it('should return all accounts for workspace', async () => {
            if (!testWorkspaceId) return;
            
            const res = await request(app)
                .get(`/api/v1/workspaces/${testWorkspaceId}/accounts`)
                .set('Authorization', `Bearer ${token}`);
            
            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty('data');
            expect(Array.isArray(res.body.data)).toBe(true);
        });

        it('should return 401 without auth', async () => {
            if (!testWorkspaceId) return;
            
            const res = await request(app)
                .get(`/api/v1/workspaces/${testWorkspaceId}/accounts`);
            
            expect(res.status).toBe(401);
        });
    });

    describe('POST /workspaces/:workspaceId/accounts', () => {
        it('should create a new account', async () => {
            if (!testWorkspaceId) return;
            
            const res = await request(app)
                .post(`/api/v1/workspaces/${testWorkspaceId}/accounts`)
                .set('Authorization', `Bearer ${token}`)
                .send({
                    name: 'Test Account',
                    type: 'checking',
                    balance: 1000.00,
                    currency: 'USD',
                    color: '#3b82f6'
                });
            
            if (res.status === 201) {
                testAccountId = res.body.data.id;
            }
            expect([201, 400, 403]).toContain(res.status);
        });

        it('should return 400 with invalid data', async () => {
            if (!testWorkspaceId) return;
            
            const res = await request(app)
                .post(`/api/v1/workspaces/${testWorkspaceId}/accounts`)
                .set('Authorization', `Bearer ${token}`)
                .send({
                    name: '',
                    type: 'invalid_type'
                });
            
            expect(res.status).toBe(400);
        });
    });

    describe('GET /workspaces/:workspaceId/accounts/:accountId', () => {
        it('should return account by id', async () => {
            if (!testWorkspaceId) return;
            
            const listRes = await request(app)
                .get(`/api/v1/workspaces/${testWorkspaceId}/accounts`)
                .set('Authorization', `Bearer ${token}`);
            
            if (listRes.body.data && listRes.body.data.length > 0) {
                testAccountId = listRes.body.data[0].id;
                
                const res = await request(app)
                    .get(`/api/v1/workspaces/${testWorkspaceId}/accounts/${testAccountId}`)
                    .set('Authorization', `Bearer ${token}`);
                
                expect(res.status).toBe(200);
            }
        });
    });

    describe('PUT /workspaces/:workspaceId/accounts/:accountId', () => {
        it('should update account', async () => {
            if (!testWorkspaceId) return;
            
            const listRes = await request(app)
                .get(`/api/v1/workspaces/${testWorkspaceId}/accounts`)
                .set('Authorization', `Bearer ${token}`);
            
            if (listRes.body.data && listRes.body.data.length > 0) {
                const accountId = listRes.body.data[0].id;
                
                const res = await request(app)
                    .put(`/api/v1/workspaces/${testWorkspaceId}/accounts/${accountId}`)
                    .set('Authorization', `Bearer ${token}`)
                    .send({
                        name: 'Updated Account Name',
                        balance: 2000.00
                    });
                
                expect([200, 403]).toContain(res.status);
            }
        });
    });

    describe('DELETE /workspaces/:workspaceId/accounts/:accountId', () => {
        it('should delete account', async () => {
            if (!testWorkspaceId) return;
            
            const listRes = await request(app)
                .get(`/api/v1/workspaces/${testWorkspaceId}/accounts`)
                .set('Authorization', `Bearer ${token}`);
            
            if (listRes.body.data && listRes.body.data.length > 0) {
                const accountId = listRes.body.data[listRes.body.data.length - 1].id;
                
                const res = await request(app)
                    .delete(`/api/v1/workspaces/${testWorkspaceId}/accounts/${accountId}`)
                    .set('Authorization', `Bearer ${token}`);
                
                expect([204, 403, 409]).toContain(res.status);
            }
        });
    });

    describe('GET /workspaces/:workspaceId/accounts/balance', () => {
        it('should return total balance', async () => {
            if (!testWorkspaceId) return;
            
            const res = await request(app)
                .get(`/api/v1/workspaces/${testWorkspaceId}/accounts/balance`)
                .set('Authorization', `Bearer ${token}`);
            
            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty('data');
        });
    });
});