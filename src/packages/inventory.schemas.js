import { z } from 'zod';

export const CreateMedicineSchema = z.object({
  name: z.string().min(2),
  genericName: z.string().optional(),
  categoryId: z.string().uuid(),
  branchId: z.string().uuid(),
  gstPercentage: z.number(),
  reorderPoint: z.number(),
  reorderLevel: z.number(),
  initialBatch: z.object({
    batchNumber: z.string(),
    quantity: z.number(),
    expiryDate: z.string(),
    mrp: z.number(),
    purchasePrice: z.number(),
  }),
});
