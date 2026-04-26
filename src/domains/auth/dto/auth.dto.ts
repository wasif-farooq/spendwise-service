import { z } from 'zod';

export const LoginSchema = z.object({
    email: z.string().email(),
    password: z.string().min(8)
});

export const RegisterSchema = z.object({
    email: z.string().email(),
    password: z.string()
        .min(8, 'Password must be at least 8 characters')
        .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
        .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
        .regex(/[0-9]/, 'Password must contain at least one number')
        .regex(/[!@#$%^&*]/, 'Password must contain at least one special character'),
    firstName: z.string().min(1, 'First name is required'),
    lastName: z.string().min(1, 'Last name is required')
});

export const ForgotPasswordSchema = z.object({
    email: z.string().email()
});

export const VerifyResetCodeSchema = z.object({
    email: z.string().email(),
    code: z.string().length(6)
});

export const ResetPasswordSchema = z.object({
    token: z.string(),
    newPassword: z.string().min(8)
});

export const ChangePasswordSchema = z.object({
    oldPassword: z.string(),
    newPassword: z.string().min(8)
});

export const Enable2FASchema = z.object({
    code: z.string().length(6)
});

export type LoginDto = z.infer<typeof LoginSchema>;
export type RegisterDto = z.infer<typeof RegisterSchema>;
export type ForgotPasswordDto = z.infer<typeof ForgotPasswordSchema>;
export type VerifyResetCodeDto = z.infer<typeof VerifyResetCodeSchema>;
export type ResetPasswordDto = z.infer<typeof ResetPasswordSchema>;
export type ChangePasswordDto = z.infer<typeof ChangePasswordSchema>;
export type Enable2FADto = z.infer<typeof Enable2FASchema>;

