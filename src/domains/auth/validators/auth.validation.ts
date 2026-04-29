import { z } from 'zod';

export const registerSchema = z.object({
    body: z.object({
        email: z.string().email(),
        password: z.string()
            .min(8, 'Password must be at least 8 characters')
            .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
            .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
            .regex(/[0-9]/, 'Password must contain at least one number')
            .regex(/[!@#$%^&*]/, 'Password must contain at least one special character'),
        firstName: z.string().min(1, 'First name is required'),
        lastName: z.string().min(1, 'Last name is required'),
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
        tempToken: z.string().uuid().optional(),
        userId: z.string().uuid().optional(),
        code: z.string().length(6),
        method: z.string().optional(),
        backupCode: z.boolean().optional(),
    }).refine(data => data.tempToken || data.userId, {
        message: 'Either tempToken or userId is required',
    }),
});

export const resend2faSchema = z.object({
    body: z.object({
        tempToken: z.string().uuid().optional(),
        userId: z.string().uuid().optional(),
        method: z.string().optional(),
    }).refine(data => data.tempToken || data.userId, {
        message: 'Either tempToken or userId is required',
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
