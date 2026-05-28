import { z } from 'zod';

export const stockInSchema = z.object({
  medicineId: z.string().uuid(),
  batchNumber: z.string().min(1),
  quantity: z.number().int().positive(),
  expiryDate: z.string().refine(val => new Date(val) > new Date(), {
    message: 'Expiry date must be in the future',
  }),
  purchasePrice: z.number().min(0),
  sellingPrice: z.number().min(0),
  notes: z.string().optional(),
});

export const stockOutSchema = z.object({
  medicineId: z.string().uuid(),
  quantity: z.number().int().positive(),
  type: z.enum(['STOCK_OUT', 'SALE', 'ADJUSTMENT', 'RETURN', 'DAMAGE', 'EXPIRED']),
  referenceType: z.string().optional(),
  referenceId: z.string().optional(),
  notes: z.string().optional(),
});

export const damageSchema = z.object({
  batchId: z.string().uuid(),
  quantity: z.number().int().positive(),
  reason: z.string().min(1),
});
