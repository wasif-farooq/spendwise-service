import { z } from 'zod';

export const UpdateUserPreferencesSchema = z.object({
    theme: z.enum(['light', 'dark', 'system']).optional(),
    language: z.string().max(10).optional(),
    timezone: z.string().max(50).optional(),
    color: z.string().max(20).optional(),
    colorScheme: z.string().max(20).optional(),
    layout: z.string().max(50).optional(),
    currency: z.string().max(10).optional(),
    notifications: z.record(z.any()).optional()
});

export type UpdateUserPreferencesDto = z.infer<typeof UpdateUserPreferencesSchema>;
