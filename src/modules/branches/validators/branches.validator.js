import { z } from 'zod';

export const createBranchSchema = z.object({
  name: z.string().min(1),
  code: z.string().min(1),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  address: z.string().optional(),
  gstNumber: z.string().optional()
});

export const updateBranchSchema = createBranchSchema.partial().extend({
  status: z.enum(['ACTIVE', 'INACTIVE']).optional()
});

export const requestTransferSchema = z.object({
  sourceBranchId: z.string().uuid(),
  destinationBranchId: z.string().uuid(),
  notes: z.string().optional(),
  items: z.array(z.object({
    batchId: z.string().uuid(),
    quantity: z.number().int().positive()
  })).min(1)
});
