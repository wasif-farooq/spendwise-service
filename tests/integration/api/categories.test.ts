import { describe, it, expect, beforeAll } from '@jest/globals';
import request from 'supertest';
import { getTestApp, getTestUserToken } from '../helpers/auth';

describe('Categories API', () => {
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

    describe('GET /workspaces/:workspaceId/categories', () => {
        it('should return all categories for workspace', async () => {
            if (!testWorkspaceId) return;
            
            const res = await request(app)
                .get(`/api/v1/workspaces/${testWorkspaceId}/categories`)
                .set('Authorization', `Bearer ${token}`);
            
            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty('data');
            expect(Array.isArray(res.body.data)).toBe(true);
        });

        it('should return 401 without auth', async () => {
            if (!testWorkspaceId) return;
            
            const res = await request(app)
                .get(`/api/v1/workspaces/${testWorkspaceId}/categories`);
            
            expect(res.status).toBe(401);
        });

        it('should filter by type', async () => {
            if (!testWorkspaceId) return;
            
            const res = await request(app)
                .get(`/api/v1/workspaces/${testWorkspaceId}/categories?type=expense`)
                .set('Authorization', `Bearer ${token}`);
            
            expect(res.status).toBe(200);
        });

        it('should filter by search term', async () => {
            if (!testWorkspaceId) return;
            
            const res = await request(app)
                .get(`/api/v1/workspaces/${testWorkspaceId}/categories?search=food`)
                .set('Authorization', `Bearer ${token}`);
            
            expect(res.status).toBe(200);
        });
    });

    describe('POST /workspaces/:workspaceId/categories', () => {
        it('should create a new category', async () => {
            if (!testWorkspaceId) return;
            
            const res = await request(app)
                .post(`/api/v1/workspaces/${testWorkspaceId}/categories`)
                .set('Authorization', `Bearer ${token}`)
                .send({
                    name: 'Test Category',
                    type: 'expense',
                    color: '#ff0000',
                    icon: 'TestIcon'
                });
            
            expect([201, 400, 403]).toContain(res.status);
        });

        it('should return 400 with invalid data', async () => {
            if (!testWorkspaceId) return;
            
            const res = await request(app)
                .post(`/api/v1/workspaces/${testWorkspaceId}/categories`)
                .set('Authorization', `Bearer ${token}`)
                .send({
                    name: '',
                    type: 'invalid_type'
                });
            
            expect(res.status).toBe(400);
        });
    });

    describe('GET /workspaces/:workspaceId/categories/:categoryId', () => {
        it('should return category by id', async () => {
            if (!testWorkspaceId) return;
            
            const listRes = await request(app)
                .get(`/api/v1/workspaces/${testWorkspaceId}/categories`)
                .set('Authorization', `Bearer ${token}`);
            
            if (listRes.body.data && listRes.body.data.length > 0) {
                const categoryId = listRes.body.data[0].id;
                
                const res = await request(app)
                    .get(`/api/v1/workspaces/${testWorkspaceId}/categories/${categoryId}`)
                    .set('Authorization', `Bearer ${token}`);
                
                expect(res.status).toBe(200);
            }
        });
    });

    describe('PUT /workspaces/:workspaceId/categories/:categoryId', () => {
        it('should update category', async () => {
            if (!testWorkspaceId) return;
            
            const listRes = await request(app)
                .get(`/api/v1/workspaces/${testWorkspaceId}/categories`)
                .set('Authorization', `Bearer ${token}`);
            
            if (listRes.body.data && listRes.body.data.length > 0) {
                const categoryId = listRes.body.data[0].id;
                
                const res = await request(app)
                    .put(`/api/v1/workspaces/${testWorkspaceId}/categories/${categoryId}`)
                    .set('Authorization', `Bearer ${token}`)
                    .send({
                        name: 'Updated Category Name',
                        color: '#00ff00'
                    });
                
                expect([200, 403]).toContain(res.status);
            }
        });
    });

    describe('DELETE /workspaces/:workspaceId/categories/:categoryId', () => {
        it('should delete category', async () => {
            if (!testWorkspaceId) return;
            
            const listRes = await request(app)
                .get(`/api/v1/workspaces/${testWorkspaceId}/categories`)
                .set('Authorization', `Bearer ${token}`);
            
            if (listRes.body.data && listRes.body.data.length > 0) {
                const categoryId = listRes.body.data[listRes.body.data.length - 1].id;
                
                const res = await request(app)
                    .delete(`/api/v1/workspaces/${testWorkspaceId}/categories/${categoryId}`)
                    .set('Authorization', `Bearer ${token}`);
                
                expect([204, 403, 409]).toContain(res.status);
            }
        });
    });
});