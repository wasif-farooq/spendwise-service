import { z } from 'zod';

export const LoginSchema = z.object({
    email: z.string().email(),
    password: z.string().min(8)
});

export const RegisterSchema = z.object({
    email: z.string().email(),
    password: z.string().min(8),
    firstName: z.string().optional(),
    lastName: z.string().optional()
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

