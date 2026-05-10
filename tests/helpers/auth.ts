import request from 'supertest';
import { Server } from '../src/server/Server';

let app: any = null;

export async function getTestApp(): Promise<any> {
    if (!app) {
        const { Server: ServerClass } = await import('../src/server/Server');
        const server = new ServerClass();
        app = server.getApp();
    }
    return app;
}

export const TEST_USER_EMAIL = 'seed_john0@test.com';
export const TEST_USER_PASSWORD = 'Test@123';

export async function getTestUserToken(): Promise<string> {
    const app = await getTestApp();
    
    const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({
            email: TEST_USER_EMAIL,
            password: TEST_USER_PASSWORD
        });
    
    if (loginRes.status !== 200) {
        throw new Error(`Login failed: ${loginRes.body.message}`);
    }
    
    return loginRes.body.token;
}

export async function getAuthenticatedRequest() {
    const app = await getTestApp();
    const token = await getTestUserToken();
    
    return {
        app,
        token,
        request: () => request(app).set('Authorization', `Bearer ${token}`)
    };
}

export async function createTestUser(email: string, password: string = 'Test@123') {
    const app = await getTestApp();
    
    const registerRes = await request(app)
        .post('/api/v1/auth/register')
        .send({
            email,
            password,
            firstName: 'Test',
            lastName: 'User'
        });
    
    if (registerRes.status === 201) {
        return registerRes.body.user;
    }
    
    return null;
}

export async function loginUser(email: string, password: string) {
    const app = await getTestApp();
    
    const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({ email, password });
    
    if (loginRes.status === 200) {
        return {
            token: loginRes.body.token,
            user: loginRes.body.user
        };
    }
    
    return null;
}

export function getTestWorkspaceId(): string {
    return '00000000-0000-0000-0000-000000000001';
}

export function getTestAccountId(): string {
    return '00000000-0000-0000-0000-000000000001';
}