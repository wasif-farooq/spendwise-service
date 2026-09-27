import express from 'express';
import request from 'supertest';
import { z } from 'zod';
import { validate } from '@shared/middleware/validate.middleware';
import {
  loginSchema,
  registerSchema,
  verify2faSchema,
  resetPasswordSchema,
  changePasswordSchema,
} from '@domains/auth/validators/auth.validation';

const buildApp = (schema: any, path = '/test') => {
  const state: { body?: any; params?: any; query?: any; error?: any } = {};

  const app = express();
  app.use(express.json());
  app.post(path, validate(schema), (req, res) => {
    state.body = req.body;
    state.params = req.params;
    state.query = req.query;
    res.json({ ok: true });
  });
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: any, _req: any, res: any, _next: any) => {
    state.error = err;
    res.status(500).json({ message: 'handled' });
  });

  return { app, state };
};

describe('validate middleware', () => {
  const schema = z.object({
    body: z.object({
      email: z.string().email(),
    }),
  });

  it('strips body keys the schema does not declare', async () => {
    const { app, state } = buildApp(schema);

    await request(app)
      .post('/test')
      .send({ email: 'user@example.com', role: 'SUPER_ADMIN', userId: 'someone-else' });

    expect(state.body).toEqual({ email: 'user@example.com' });
    expect(state.body.role).toBeUndefined();
    expect(state.body.userId).toBeUndefined();
  });

  it('returns 400 with the same error shape as validateBody', async () => {
    const { app } = buildApp(schema);

    const res = await request(app).post('/test').send({ email: 'not-an-email' });

    expect(res.status).toBe(400);
    expect(Array.isArray(res.body.errors)).toBe(true);
  });

  it('does not wipe the body when the schema declares no body', async () => {
    const paramsOnly = z.object({
      params: z.object({ id: z.string() }),
    });
    const { app, state } = buildApp(paramsOnly, '/thing/:id');

    await request(app).post('/thing/abc').send({ keep: 'me' });

    // A params-only schema must leave req.body alone rather than blanking it.
    expect(state.body).toEqual({ keep: 'me' });
    expect(state.params.id).toBe('abc');
  });

  it('leaves params and query untouched', async () => {
    const withQuery = z.object({
      query: z.object({ page: z.string().optional() }),
      params: z.object({ id: z.string() }),
    });
    const { app, state } = buildApp(withQuery, '/thing/:id');

    await request(app).post('/thing/abc?page=2&extra=kept').send({});

    expect(state.params.id).toBe('abc');
    expect(state.query.page).toBe('2');
    expect(state.query.extra).toBe('kept');
  });

  it('forwards non-validation errors to the error handler', async () => {
    const exploding: any = {
      parseAsync: async () => {
        throw new Error('boom');
      },
    };
    const { app, state } = buildApp(exploding);

    const res = await request(app).post('/test').send({});

    expect(res.status).toBe(500);
    expect(state.error?.message).toBe('boom');
  });
});

describe('auth schemas accept the real client payloads', () => {
  it('keeps login fields', () => {
    const parsed = loginSchema.parse({
      body: { email: 'user@example.com', password: 'Sup3rSecret!' },
    });

    expect(parsed.body).toEqual({ email: 'user@example.com', password: 'Sup3rSecret!' });
  });

  it('keeps register fields and strips an injected role', () => {
    const parsed: any = registerSchema.parse({
      body: {
        email: 'user@example.com',
        password: 'Sup3rSecret!',
        firstName: 'Ada',
        lastName: 'Lovelace',
        role: 'SUPER_ADMIN',
        emailVerified: true,
      },
    });

    expect(parsed.body.firstName).toBe('Ada');
    expect(parsed.body.role).toBeUndefined();
    expect(parsed.body.emailVerified).toBeUndefined();
  });

  it('keeps the 2FA verification fields, including the backup-code flag', () => {
    const parsed = verify2faSchema.parse({
      body: {
        tempToken: 'header.payload.signature',
        code: '12345678',
        method: 'email',
        backupCode: true,
      },
    });

    expect(parsed.body.tempToken).toBe('header.payload.signature');
    expect(parsed.body.backupCode).toBe(true);
    expect(parsed.body.code).toBe('12345678');
  });

  it('keeps change-password fields the client sends', () => {
    const parsed = changePasswordSchema.parse({
      body: { currentPassword: 'Old!Passw0rd', newPassword: 'New!Passw0rd' },
    });

    expect(parsed.body.currentPassword).toBe('Old!Passw0rd');
    expect(parsed.body.newPassword).toBe('New!Passw0rd');
  });

  it('keeps reset-password fields', () => {
    const parsed = resetPasswordSchema.parse({
      body: { token: 'reset.jwt.here', newPassword: 'An0therSecret!' },
    });

    expect(parsed.body.token).toBe('reset.jwt.here');
    expect(parsed.body.newPassword).toBe('An0therSecret!');
  });
});
