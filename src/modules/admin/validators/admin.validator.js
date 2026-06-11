import { z } from 'zod';

export const adminLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export const adminRefreshSchema = z.object({
  refreshToken: z.string(),
});

export const adminCreateSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(2),
  role: z.enum(['ROOT_ADMIN', 'ADMIN', 'SUPPORT', 'SALES', 'FINANCE']).default('SUPPORT'),
  permissions: z.array(z.string()).default([]),
});

export const adminUpdateSchema = z.object({
  name: z.string().min(2).optional(),
  role: z.enum(['ROOT_ADMIN', 'ADMIN', 'SUPPORT', 'SALES', 'FINANCE']).optional(),
  permissions: z.array(z.string()).optional(),
  isActive: z.boolean().optional(),
});

export const adminListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().optional(),
  role: z.enum(['ROOT_ADMIN', 'ADMIN', 'SUPPORT', 'SALES', 'FINANCE']).optional(),
  isActive: z.coerce.boolean().optional(),
  sortBy: z.enum(['createdAt', 'lastLoginAt', 'email', 'name']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export const auditLogQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(50),
  adminUserId: z.string().uuid().optional(),
  action: z.string().optional(),
  targetType: z.string().optional(),
  targetId: z.string().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  sortBy: z.enum(['createdAt']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});