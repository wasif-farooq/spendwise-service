import { z } from 'zod';
import { currencyCode } from '@domains/currencies/currencyCode';

export const CreateAccountSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  type: z.enum(['bank', 'savings', 'cash', 'credit_card', 'investment']),
  balance: z.number().min(0, 'Balance must be positive'),
  currency: currencyCode(),
  color: z.string().optional(),
});

export const UpdateAccountSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  type: z.enum(['bank', 'savings', 'cash', 'credit_card', 'investment']).optional(),
  balance: z.number().min(0).optional(),
  currency: currencyCode().optional(),
  color: z.string().optional(),
});

export const AccountIdParamSchema = z.object({
  id: z.string().uuid('Invalid account ID'),
});

export type CreateAccountDto = z.infer<typeof CreateAccountSchema>;
export type UpdateAccountDto = z.infer<typeof UpdateAccountSchema>;
export type AccountIdParam = z.infer<typeof AccountIdParamSchema>;
