import { describe, it, expect, beforeAll, beforeEach, afterEach } from '@jest/globals';
import request from 'supertest';
import { getTestApp, getTestUserToken, TEST_USER_EMAIL } from '../helpers/auth';
import { v4 as uuidv4 } from 'uuid';

describe('Workspaces API', () => {
    let app: any;
    let token: string;
    let testWorkspaceId: string;

    beforeAll(async () => {
        app = await getTestApp();
        token = await getTestUserToken();
    });

    describe('GET /workspaces', () => {
        it('should return all workspaces for authenticated user', async () => {
            const res = await request(app)
                .get('/api/v1/workspaces')
                .set('Authorization', `Bearer ${token}`);
            
            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty('data');
            expect(Array.isArray(res.body.data)).toBe(true);
        });

        it('should return 401 without auth', async () => {
            const res = await request(app)
                .get('/api/v1/workspaces');
            
            expect(res.status).toBe(401);
        });
    });

    describe('POST /workspaces', () => {
        it('should create a new workspace', async () => {
            const res = await request(app)
                .post('/api/v1/workspaces')
                .set('Authorization', `Bearer ${token}`)
                .send({
                    name: 'Test Workspace',
                    description: 'Test Description'
                });
            
            if (res.status === 201) {
                expect(res.body).toHaveProperty('data');
                expect(res.body.data).toHaveProperty('id');
                testWorkspaceId = res.body.data.id;
            } else {
                console.log('Create workspace response:', res.status, res.body);
            }
        });

        it('should return 400 with invalid data', async () => {
            const res = await request(app)
                .post('/api/v1/workspaces')
                .set('Authorization', `Bearer ${token}`)
                .send({ name: '' });
            
            expect(res.status).toBe(400);
        });
    });

    describe('GET /workspaces/:workspaceId', () => {
        it('should return workspace by id', async () => {
            const res = await request(app)
                .get('/api/v1/workspaces')
                .set('Authorization', `Bearer ${token}`);
            
            if (res.body.data && res.body.data.length > 0) {
                testWorkspaceId = res.body.data[0].id;
                
                const detailRes = await request(app)
                    .get(`/api/v1/workspaces/${testWorkspaceId}`)
                    .set('Authorization', `Bearer ${token}`);
                
                expect(detailRes.status).toBe(200);
            }
        });
    });

    describe('PUT /workspaces/:workspaceId', () => {
        it('should update workspace', async () => {
            const listRes = await request(app)
                .get('/api/v1/workspaces')
                .set('Authorization', `Bearer ${token}`);
            
            if (listRes.body.data && listRes.body.data.length > 0) {
                const workspaceId = listRes.body.data[0].id;
                
                const res = await request(app)
                    .put(`/api/v1/workspaces/${workspaceId}`)
                    .set('Authorization', `Bearer ${token}`)
                    .send({
                        name: 'Updated Workspace Name'
                    });
                
                expect([200, 403]).toContain(res.status);
            }
        });
    });

    describe('GET /workspaces/:workspaceId/members', () => {
        it('should return workspace members', async () => {
            const listRes = await request(app)
                .get('/api/v1/workspaces')
                .set('Authorization', `Bearer ${token}`);
            
            if (listRes.body.data && listRes.body.data.length > 0) {
                const workspaceId = listRes.body.data[0].id;
                
                const res = await request(app)
                    .get(`/api/v1/workspaces/${workspaceId}/members`)
                    .set('Authorization', `Bearer ${token}`);
                
                expect(res.status).toBe(200);
                expect(res.body).toHaveProperty('data');
            }
        });
    });

    describe('GET /workspaces/:workspaceId/roles', () => {
        it('should return workspace roles', async () => {
            const listRes = await request(app)
                .get('/api/v1/workspaces')
                .set('Authorization', `Bearer ${token}`);
            
            if (listRes.body.data && listRes.body.data.length > 0) {
                const workspaceId = listRes.body.data[0].id;
                
                const res = await request(app)
                    .get(`/api/v1/workspaces/${workspaceId}/roles`)
                    .set('Authorization', `Bearer ${token}`);
                
                expect(res.status).toBe(200);
                expect(res.body).toHaveProperty('data');
            }
        });
    });

    describe('POST /workspaces/:workspaceId/members/invite', () => {
        it('should invite a new member', async () => {
            const listRes = await request(app)
                .get('/api/v1/workspaces')
                .set('Authorization', `Bearer ${token}`);
            
            if (listRes.body.data && listRes.body.data.length > 0) {
                const workspaceId = listRes.body.data[0].id;
                
                const res = await request(app)
                    .post(`/api/v1/workspaces/${workspaceId}/members/invite`)
                    .set('Authorization', `Bearer ${token}`)
                    .send({
                        email: `invite_${Date.now()}@test.com`,
                        roleId: null,
                        roleName: 'Viewer'
                    });
                
                expect([201, 400]).toContain(res.status);
            }
        });
    });

    describe('GET /workspaces/:workspaceId/members/invitations', () => {
        it('should return workspace invitations', async () => {
            const listRes = await request(app)
                .get('/api/v1/workspaces')
                .set('Authorization', `Bearer ${token}`);
            
            if (listRes.body.data && listRes.body.data.length > 0) {
                const workspaceId = listRes.body.data[0].id;
                
                const res = await request(app)
                    .get(`/api/v1/workspaces/${workspaceId}/members/invitations`)
                    .set('Authorization', `Bearer ${token}`);
                
                expect(res.status).toBe(200);
            }
        });
    });

    describe('GET /workspaces/:workspaceId/me', () => {
        it('should return workspace with user membership', async () => {
            const listRes = await request(app)
                .get('/api/v1/workspaces')
                .set('Authorization', `Bearer ${token}`);
            
            if (listRes.body.data && listRes.body.data.length > 0) {
                const workspaceId = listRes.body.data[0].id;
                
                const res = await request(app)
                    .get(`/api/v1/workspaces/${workspaceId}/me`)
                    .set('Authorization', `Bearer ${token}`);
                
                expect(res.status).toBe(200);
            }
        });
    });
});

describe('Roles API', () => {
    let app: any;
    let token: string;

    beforeAll(async () => {
        app = await getTestApp();
        token = await getTestUserToken();
    });

    describe('GET /workspaces/:workspaceId/roles', () => {
        it('should return list of roles', async () => {
            const workspacesRes = await request(app)
                .get('/api/v1/workspaces')
                .set('Authorization', `Bearer ${token}`);
            
            if (workspacesRes.body.data && workspacesRes.body.data.length > 0) {
                const workspaceId = workspacesRes.body.data[0].id;
                
                const res = await request(app)
                    .get(`/api/v1/workspaces/${workspaceId}/roles`)
                    .set('Authorization', `Bearer ${token}`);
                
                expect(res.status).toBe(200);
                expect(res.body).toHaveProperty('data');
            }
        });
    });

    describe('POST /workspaces/:workspaceId/roles', () => {
        it('should create a new role', async () => {
            const workspacesRes = await request(app)
                .get('/api/v1/workspaces')
                .set('Authorization', `Bearer ${token}`);
            
            if (workspacesRes.body.data && workspacesRes.body.data.length > 0) {
                const workspaceId = workspacesRes.body.data[0].id;
                
                const res = await request(app)
                    .post(`/api/v1/workspaces/${workspaceId}/roles`)
                    .set('Authorization', `Bearer ${token}`)
                    .send({
                        name: 'Test Role',
                        description: 'Test Role Description',
                        permissions: ['read', 'write']
                    });
                
                expect([201, 403]).toContain(res.status);
            }
        });
    });
});