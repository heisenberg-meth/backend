import { z } from 'zod';

export const checkoutSchema = z.object({
  items: z.array(z.object({
    medicineId: z.string().uuid(),
    quantity: z.number().int().positive(),
    discountPercentage: z.number().min(0).max(100).optional()
  })).min(1, 'At least one item is required'),
  patientId: z.string().uuid().optional(),
  paymentMethod: z.enum(['CASH', 'CARD', 'UPI']).default('CASH'),
  discountAmount: z.number().min(0).optional()
});
