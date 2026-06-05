import { z } from 'zod';

export const patientSchema = z.object({
  name: z.string().min(1),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  address: z.string().optional(),
});

export const salesReturnSchema = z.object({
  saleItemId: z.string().uuid(),
  quantity: z.number().int().positive(),
  reason: z.string().min(1),
  condition: z.enum(['sealed', 'damaged', 'expired']).default('sealed'),
});
