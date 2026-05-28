import { z } from 'zod';

export const alertSettingsSchema = z.object({
  lowStockThreshold: z.number().int().min(0).optional(),
  criticalStockThreshold: z.number().int().min(0).optional(),
  expiryWarningDays: z.number().int().min(0).optional(),
  criticalExpiryDays: z.number().int().min(0).optional(),
  autoRaisePO: z.boolean().optional(),
  escalationHours: z.number().int().min(1).optional(),
});

export const overrideSchema = z.object({
  medicineId: z.string().uuid(),
  lowStockThreshold: z.number().int().min(0).optional().nullable(),
  criticalStockThreshold: z.number().int().min(0).optional().nullable(),
  expiryWarningDays: z.number().int().min(0).optional().nullable(),
  criticalExpiryDays: z.number().int().min(0).optional().nullable(),
});
