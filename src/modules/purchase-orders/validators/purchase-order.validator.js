import { z } from 'zod';

export const createPurchaseOrderSchema = z.object({
  supplierId: z.string().uuid(),
  branchId: z.string().uuid().optional(),
  expectedDeliveryDate: z.string().datetime().optional(),
  notes: z.string().optional(),
  items: z
    .array(
      z.object({
        medicineId: z.string().uuid(),
        medicineName: z.string(),
        currentStock: z.number().int(),
        reorderQty: z.number().int(),
        quantity: z.number().int().positive(),
        unitPrice: z.number().positive(),
        gstPercentage: z.number().min(0).default(0),
        totalAmount: z.number().positive(),
      }),
    )
    .min(1),
  subtotal: z.number().positive(),
  gstAmount: z.number().min(0),
  totalAmount: z.number().positive(),
});

export const receivePurchaseOrderSchema = z.object({
  receivedItems: z
    .array(
      z.object({
        medicineId: z.string().uuid(),
        receivedQuantity: z.number().int().positive(),
        batchNumber: z.string().min(1),
        expiryDate: z.string().datetime(),
      }),
    )
    .min(1),
  notes: z.string().optional(),
});

export const approvePurchaseOrderSchema = z.object({
  notes: z.string().optional(),
});

export const cancelPurchaseOrderSchema = z.object({
  reason: z.string().min(1),
});
