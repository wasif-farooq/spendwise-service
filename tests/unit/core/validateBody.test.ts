import express from 'express';
import request from 'supertest';
import { z } from 'zod';
import { validateBody, validateParams } from '@shared/middleware/validateBody.middleware';
import {
  CreateTransactionSchema,
  UpdateTransactionSchema,
} from '@domains/transactions/routes/transaction.routes';

const buildApp = (schema: any, path = '/test') => {
  const app = express();
  app.use(express.json());

  let seen: any;
  app.post(path, validateBody(schema), (req, res) => {
    seen = req.body;
    res.json({ ok: true });
  });

  return { app, body: () => seen };
};

describe('validateBody', () => {
  const schema = z.object({
    name: z.string(),
    count: z.number().optional(),
  });

  it('passes declared fields through', async () => {
    const { app, body } = buildApp(schema);

    await request(app).post('/test').send({ name: 'hello', count: 2 });

    expect(body()).toEqual({ name: 'hello', count: 2 });
  });

  it('strips fields the schema does not declare', async () => {
    const { app, body } = buildApp(schema);

    await request(app)
      .post('/test')
      .send({ name: 'hello', role: 'admin', workspaceId: 'ws-victim' });

    // The whole point: undeclared keys must not reach the controller.
    expect(body()).toEqual({ name: 'hello' });
    expect(body().role).toBeUndefined();
    expect(body().workspaceId).toBeUndefined();
  });

  it('still rejects invalid bodies with 400', async () => {
    const { app } = buildApp(schema);

    const res = await request(app).post('/test').send({ count: 2 });

    expect(res.status).toBe(400);
    expect(res.body.errors).toBeDefined();
  });

  it('leaves req.params untouched', async () => {
    const app = express();
    app.use(express.json());

    let seenParams: any;
    app.post(
      '/thing/:id',
      validateParams(z.object({ id: z.string() })),
      (req, res) => {
        seenParams = req.params;
        res.json({ ok: true });
      },
    );

    await request(app).post('/thing/abc').send({});

    expect(seenParams.id).toBe('abc');
  });
});

describe('transaction schemas accept the real client payload', () => {
  /** Exactly what useTransactionForm sends when creating. */
  const createPayload = {
    accountId: '11111111-1111-4111-8111-111111111111',
    description: 'Coffee',
    amount: 4.5,
    type: 'expense',
    categoryId: '22222222-2222-4222-8222-222222222222',
    date: '2026-08-16',
    receiptIds: ['33333333-3333-4333-8333-333333333333'],
    currency: 'USD',
    linkedTransactionIds: undefined,
  };

  it('keeps every field the create form sends', () => {
    const parsed = CreateTransactionSchema.parse(createPayload);

    expect(parsed.accountId).toBe(createPayload.accountId);
    expect(parsed.receiptIds).toEqual(createPayload.receiptIds);
    expect(parsed.categoryId).toBe(createPayload.categoryId);
    expect(parsed.currency).toBe('USD');
    expect(parsed.amount).toBe(4.5);
  });

  it('keeps every field the update form sends', () => {
    const parsed = UpdateTransactionSchema.parse({
      description: 'Coffee',
      amount: 4.5,
      type: 'expense',
      categoryId: '22222222-2222-4222-8222-222222222222',
      date: '2026-08-16',
      receiptIds: ['33333333-3333-4333-8333-333333333333'],
      currency: 'USD',
      linkedTransactionIds: null,
    });

    expect(parsed.receiptIds).toHaveLength(1);
    expect(parsed.linkedTransactionIds).toBeNull();
  });

  it('accepts null linkedTransactionIds, which the client sends to clear links', () => {
    // Previously `.optional()` alone rejected null, so saving an edit with no
    // linked transactions failed validation with a 400.
    expect(() =>
      UpdateTransactionSchema.parse({ linkedTransactionIds: null }),
    ).not.toThrow();
  });

  it('treats an empty categoryId as no category', () => {
    // The forms send "" when no category is picked; the uuid check used to
    // reject it with a 400.
    const created = CreateTransactionSchema.parse({ ...createPayload, categoryId: '' });
    expect(created.categoryId).toBeUndefined();
    expect(UpdateTransactionSchema.parse({ categoryId: '' }).categoryId).toBeUndefined();
  });

  it('still rejects a categoryId that is not a uuid', () => {
    expect(() => CreateTransactionSchema.parse({ ...createPayload, categoryId: 'food' })).toThrow();
  });

  it('accepts moving a transaction to another account', () => {
    const parsed = UpdateTransactionSchema.parse({
      accountId: '44444444-4444-4444-8444-444444444444',
    });

    expect(parsed.accountId).toBe('44444444-4444-4444-8444-444444444444');
  });

  it('strips injected fields from a create payload', () => {
    const parsed: any = CreateTransactionSchema.parse({
      ...createPayload,
      workspaceId: 'ws-victim',
      userId: 'someone-else',
      baseAmount: 999999,
    });

    expect(parsed.workspaceId).toBeUndefined();
    expect(parsed.userId).toBeUndefined();
    expect(parsed.baseAmount).toBeUndefined();
  });
});
