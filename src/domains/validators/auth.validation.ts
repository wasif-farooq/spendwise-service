import { z } from 'zod';

export const registerSchema = z.object({
    body: z.object({
        email: z.string().email(),
        password: z.string().min(8),
        firstName: z.string().optional(),
        lastName: z.string().optional(),
    }),
});

export const loginSchema = z.object({
    body: z.object({
        email: z.string().email(),
        password: z.string(),
    }),
});

export const verify2faSchema = z.object({
    body: z.object({
        userId: z.string().uuid(),
        code: z.string().length(6),
        method: z.string().optional(),
    }),
});

export const resend2faSchema = z.object({
    body: z.object({
        userId: z.string().uuid(),
        method: z.string().optional(),
    }),
});

export const verifyBackupCodeSchema = z.object({
    body: z.object({
        userId: z.string().uuid(),
        code: z.string().length(8), // Assuming 8 chars for backup code
    }),
});

export const forgotPasswordSchema = z.object({
    body: z.object({
        email: z.string().email(),
    }),
});

export const verifyResetCodeSchema = z.object({
    body: z.object({
        email: z.string().email(),
        code: z.string().length(6),
    }),
});

export const resetPasswordSchema = z.object({
    body: z.object({
        token: z.string(),
        newPassword: z.string().min(8),
    }),
});

export const verifyEmailSchema = z.object({
    body: z.object({
        email: z.string().email(),
        code: z.string().length(6),
    }),
});
