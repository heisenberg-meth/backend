import { z } from 'zod';

export const registerSchema = z
  .object({
    email: z
      .string({ required_error: 'Email is required' })
      .email('Valid email address required')
      .toLowerCase()
      .trim(),
    password: z
      .string({ required_error: 'Password is required' })
      .trim()
      .min(8, 'Password must be at least 8 characters'),
    confirmPassword: z.string({ required_error: 'Password confirmation is required' }).trim(),
    fullName: z.string({ required_error: 'Full name is required' }).trim(),
    role: z.enum(['owner', 'staff']).default('owner'),
    shopName: z.string().trim().optional().nullable(),
    branchName: z.string().trim().optional().nullable(),
    fingerprint: z.string().optional().nullable(),
  })
  .superRefine((data, ctx) => {
    if (data.password !== data.confirmPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Passwords do not match',
        path: ['confirmPassword'],
      });
    }
    if (data.role === 'owner' && (!data.shopName || data.shopName.trim() === '')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Shop name is required for owners',
        path: ['shopName'],
      });
    }
  });

export const loginSchema = z.object({
  email: z
    .string({ required_error: 'Email is required' })
    .email('Valid email address required')
    .toLowerCase()
    .trim(),
  password: z.string({ required_error: 'Password is required' }).trim(),
});

export const forgotPasswordSchema = z.object({
  email: z
    .string({ required_error: 'Email is required' })
    .email('Valid email address required')
    .toLowerCase()
    .trim(),
});

export const verifyResetOtpSchema = z.object({
  email: z
    .string({ required_error: 'Email is required' })
    .email('Valid email address required')
    .toLowerCase()
    .trim(),
  otp: z
    .string({ required_error: 'OTP is required' })
    .length(6, 'OTP must be exactly 6 digits')
    .regex(/^\d{6}$/, 'OTP must be numeric'),
});

export const resetPasswordSchema = z.object({
  resetToken: z.string({ required_error: 'Reset token is required' }).trim(),
  newPassword: z
    .string({ required_error: 'New password is required' })
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least 1 uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least 1 lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least 1 number')
    .regex(/[^A-Za-z0-9]/, 'Password must contain at least 1 special character'),
});

export const resendResetOtpSchema = z.object({
  email: z
    .string({ required_error: 'Email is required' })
    .email('Valid email address required')
    .toLowerCase()
    .trim(),
});
