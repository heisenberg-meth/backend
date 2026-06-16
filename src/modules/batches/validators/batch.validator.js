import { z } from 'zod';

export const createBatchSchema = z.object({
  medicineId: z.string().uuid('Invalid medicine ID'),
  batchNumber: z.string().min(1, 'Batch number is required'),
  quantity: z.number().int().min(0, 'Quantity must be non-negative'),
  purchasePrice: z.number().min(0, 'Purchase price must be non-negative').default(0),
  sellingPrice: z.number().min(0, 'Selling price must be non-negative').default(0),
  expiryDate: z
    .string()
    .refine(
      (val) => {
        const d = new Date(val);
        return !isNaN(d.getTime());
      },
      { message: 'Invalid expiry date' },
    )
    .transform((val) => new Date(val).toISOString()),
  manufacturingDate: z.string().optional().nullable(),
  barcode: z.string().optional().default(''),
  rackLocation: z.string().optional().default(''),
  branchId: z.string().uuid('Invalid branch ID').optional().nullable(),
  supplierId: z.string().uuid('Invalid supplier ID').optional().nullable(),
});

export const updateBatchSchema = z.object({
  batchNumber: z.string().min(1).optional(),
  quantity: z.number().int().min(0).optional(),
  purchasePrice: z.number().min(0).optional(),
  sellingPrice: z.number().min(0).optional(),
  expiryDate: z
    .string()
    .refine((val) => !isNaN(new Date(val).getTime()), {
      message: 'Invalid expiry date',
    })
    .transform((val) => new Date(val).toISOString())
    .optional(),
  manufacturingDate: z.string().optional().nullable(),
  barcode: z.string().optional(),
  rackLocation: z.string().optional(),
  status: z
    .enum(['ACTIVE', 'NEAR_EXPIRY', 'EXPIRED', 'QUARANTINED', 'RETURNED', 'DAMAGED'])
    .optional(),
});

export const quarantineBatchSchema = z.object({
  reason: z.enum(['recall', 'damage', 'expiry', 'quality_issue'], {
    errorMap: () => ({ message: 'Reason must be one of: recall, damage, expiry, quality_issue' }),
  }),
  notes: z.string().optional().default(''),
});
