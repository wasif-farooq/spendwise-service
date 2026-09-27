import { z } from 'zod';

export const ActivityQuerySchema = z.object({
  startDate: z.string().refine((val) => {
    const date = new Date(val);
    return !isNaN(date.getTime());
  }, 'Invalid startDate format'),
  endDate: z.string().refine((val) => {
    const date = new Date(val);
    return !isNaN(date.getTime());
  }, 'Invalid endDate format'),
  entityType: z.string().optional(),
  entityId: z.string().uuid('Invalid entity ID').optional(),
  userId: z.string().uuid('Invalid user ID').optional(),
  action: z
    .enum([
      'create',
      'update',
      'delete',
      'login',
      'logout',
      'password_change',
      'invite',
      'remove',
      'assign',
      'revoke',
    ])
    .optional(),
  limit: z.coerce.number().min(1).max(100).default(50).optional(),
  cursor: z.string().optional(),
});

export const EntityHistoryParamsSchema = z.object({
  entityType: z.string(),
  entityId: z.string().uuid('Invalid entity ID'),
});

export const EntityHistoryQuerySchema = z.object({
  startDate: z.string().refine((val) => {
    const date = new Date(val);
    return !isNaN(date.getTime());
  }, 'Invalid startDate format'),
  endDate: z.string().refine((val) => {
    const date = new Date(val);
    return !isNaN(date.getTime());
  }, 'Invalid endDate format'),
  limit: z.coerce.number().min(1).max(200).default(100).optional(),
});
