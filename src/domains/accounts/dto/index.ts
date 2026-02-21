import { z } from 'zod';

export const CreateAccountSchema = z.object({
    name: z.string().min(1, 'Name is required').max(100),
    type: z.enum(['bank', 'savings', 'cash', 'credit_card', 'investment']),
    balance: z.number().min(0, 'Balance must be positive'),
    currency: z.string().length(3, 'Currency must be 3-letter code'),
    color: z.string().optional(),
});

export const UpdateAccountSchema = z.object({
    name: z.string().min(1).max(100).optional(),
    balance: z.number().min(0).optional(),
    color: z.string().optional(),
});

export const AccountIdParamSchema = z.object({
    id: z.string().uuid('Invalid account ID'),
});

export type CreateAccountDto = z.infer<typeof CreateAccountSchema>;
export type UpdateAccountDto = z.infer<typeof UpdateAccountSchema>;
export type AccountIdParam = z.infer<typeof AccountIdParamSchema>;
