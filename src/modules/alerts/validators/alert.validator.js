import { z } from 'zod';

export const lowStockQuerySchema = z.object({
  branchId: z.string().uuid('Invalid branch ID').optional(),
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL', 'INFO', 'WARNING']).optional(),
  status: z.enum(['ACTIVE', 'SNOOZED', 'ACKNOWLEDGED', 'RESOLVED', 'ESCALATED', 'ON_ORDER']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export const expiringQuerySchema = z.object({
  branchId: z.string().uuid('Invalid branch ID').optional(),
  severity: z.enum(['INFO', 'WARNING', 'CRITICAL']).optional(),
  status: z.enum(['ACTIVE', 'SNOOZED', 'ACKNOWLEDGED', 'RESOLVED', 'ESCALATED', 'ON_ORDER']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export const snoozeAlertSchema = z.object({
  snoozedUntil: z.string().datetime('Invalid datetime format'),
  reason: z.string().min(1).max(500).optional(),
});

export const markOnOrderSchema = z.object({
  purchaseOrderId: z.string().uuid('Invalid purchase order ID').optional(),
  note: z.string().max(500).optional(),
});

export const raisePOSchema = z.object({
  supplierId: z.string().uuid('Invalid supplier ID').optional(),
  quantity: z.number().int().min(1).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
});

export const resolveAlertSchema = z.object({
  note: z.string().max(500).optional(),
});

export const acknowledgeAlertSchema = z.object({
  note: z.string().max(500).optional(),
  purchaseOrderId: z.string().uuid('Invalid purchase order ID').optional(),
});

export const criticalQuerySchema = z.object({
  branchId: z.string().uuid('Invalid branch ID').optional(),
});

export const escalatedQuerySchema = z.object({
  branchId: z.string().uuid('Invalid branch ID').optional(),
  days: z.coerce.number().int().min(1).max(365).default(30),
});

export const analyticsQuerySchema = z.object({
  branchId: z.string().uuid('Invalid branch ID').optional(),
  days: z.coerce.number().int().min(1).max(365).default(30),
});
