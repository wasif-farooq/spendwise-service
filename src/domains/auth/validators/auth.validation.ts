import { z } from 'zod';

/**
 * The password policy, defined once so every path that sets a password
 * enforces the same rules. Password.create only checks length, so the strength
 * requirements live here — duplicating them per endpoint is how a strong
 * policy at registration ends up bypassable at password change.
 */
export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number')
  .regex(/[!@#$%^&*]/, 'Password must contain at least one special character');

export const registerSchema = z.object({
  body: z.object({
    email: z.string().email(),
    password: passwordSchema,
    firstName: z.string().min(1, 'First name is required'),
    lastName: z.string().min(1, 'Last name is required'),
  }),
});

export const changePasswordSchema = z.object({
  body: z
    .object({
      currentPassword: z.string().min(1, 'Current password is required'),
      newPassword: passwordSchema,
    })
    .refine((data) => data.currentPassword !== data.newPassword, {
      message: 'New password must be different from the current password',
      path: ['newPassword'],
    }),
});

export const loginSchema = z.object({
  body: z.object({
    email: z.string().email(),
    password: z.string(),
  }),
});

// tempToken is an opaque signed token, not a user id — it must never be
// accepted as a bare UUID, and a caller-supplied userId is not proof of
// anything, so it is no longer honoured.
export const verify2faSchema = z.object({
  body: z
    .object({
      tempToken: z.string().min(1, 'tempToken is required'),
      code: z.string().min(6).max(8),
      method: z.string().optional(),
      backupCode: z.boolean().optional(),
    })
    .refine((data) => (data.backupCode ? data.code.length === 8 : data.code.length === 6), {
      message: 'Backup codes are 8 digits; verification codes are 6 digits',
      path: ['code'],
    }),
});

export const resend2faSchema = z.object({
  body: z.object({
    tempToken: z.string().min(1, 'tempToken is required'),
    method: z.string().optional(),
  }),
});

export const verifyBackupCodeSchema = z.object({
  body: z.object({
    tempToken: z.string().min(1, 'tempToken is required'),
    code: z.string().length(8),
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
    token: z.string().min(1, 'Reset token is required'),
    newPassword: passwordSchema,
  }),
});

export const verifyEmailSchema = z.object({
  body: z.object({
    email: z.string().email(),
    code: z.string().length(6),
  }),
});
