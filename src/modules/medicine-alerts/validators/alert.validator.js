import { z } from 'zod';

export const lowStockQuerySchema = z.object({
  branchId: z.string().uuid('Invalid branch ID').optional(),
  severity: z.enum(['INFO', 'WARNING', 'CRITICAL']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export const expiryQuerySchema = z.object({
  branchId: z.string().uuid('Invalid branch ID').optional(),
  severity: z.enum(['INFO', 'WARNING', 'CRITICAL']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export const outOfStockQuerySchema = z.object({
  branchId: z.string().uuid('Invalid branch ID').optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

export const criticalAlertsQuerySchema = z.object({
  branchId: z.string().uuid('Invalid branch ID').optional(),
});

export const expirySummaryQuerySchema = z.object({
  branchId: z.string().uuid('Invalid branch ID').optional(),
  daysThreshold: z.coerce.number().int().min(1).max(365).default(90),
});

export const reorderQuerySchema = z.object({
  medicineId: z.string().uuid('Invalid medicine ID').optional(),
  branchId: z.string().uuid('Invalid branch ID').optional(),
});

export const alertTrendsQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).default(30),
  branchId: z.string().uuid('Invalid branch ID').optional(),
});

export const resolveAlertSchema = z.object({
  alertId: z.string().uuid('Invalid alert ID'),
});

export const snoozeAlertSchema = z.object({
  alertId: z.string().uuid('Invalid alert ID'),
  snoozedUntil: z.string().datetime('Invalid datetime format'),
});

export const alertActionSchema = z.object({
  action: z.enum(['dismiss', 'acknowledge', 'escalate', 'create_po', 'transfer_stock']),
  reason: z.string().min(1).max(500).optional(),
});
