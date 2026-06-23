import { z } from 'zod';

const createPurchaseOrderItemSchema = z.object({
  medicineId: z.string().uuid('Invalid medicine ID'),
  quantity: z.number().int().positive('Quantity must be greater than zero'),
  unitPrice: z.number().positive('Unit price must be greater than zero'),
  gstPercentage: z.number().min(0).max(100).default(0),
});

export const createPurchaseOrderSchema = z.object({
  supplierId: z.string().uuid('Invalid supplier ID'),
  branchId: z.string().uuid('Invalid branch ID').optional(),
  expectedDeliveryDate: z
    .string()
    .refine((val) => !isNaN(Date.parse(val)), 'Invalid delivery date')
    .optional(),
  paymentMode: z.enum(['CASH', 'CREDIT', 'UPI', 'BANK_TRANSFER', 'CHEQUE']).optional(),
  paymentTermsDays: z.number().int().min(0).max(365).optional(),
  discountAmount: z.number().min(0).default(0),
  notes: z.string().max(500).optional(),
  items: z
    .array(createPurchaseOrderItemSchema)
    .min(1, 'At least one medicine is required')
    .max(100, 'Cannot order more than 100 different medicines in a single PO'),
});

export const receivePurchaseOrderSchema = z.object({
  supplierInvoiceNumber: z.string().min(1, 'Supplier invoice number is required'),
  invoiceDate: z
    .string()
    .refine((val) => !isNaN(Date.parse(val)), 'Invalid invoice date'),
  receivedItems: z
    .array(
      z.object({
        purchaseOrderItemId: z.string().uuid('Invalid PO item ID'),
        receivedQuantity: z.number().int().positive('Received quantity must be greater than zero'),
        batchNumber: z.string().min(1, 'Batch number is required'),
        expiryDate: z
          .string()
          .refine((val) => !isNaN(Date.parse(val)), 'Invalid expiry date')
          .transform((val) => new Date(val).toISOString()),
        manufacturingDate: z
          .string()
          .refine((val) => !isNaN(Date.parse(val)), 'Invalid manufacturing date')
          .optional(),
        purchasePrice: z.number().positive('Purchase price must be greater than zero'),
        mrp: z.number().positive('MRP must be greater than zero'),
        sellingPrice: z.number().positive('Selling price must be greater than zero'),
      }),
    )
    .min(1, 'At least one received item is required'),
  notes: z.string().max(500).optional(),
});

export const approvePurchaseOrderSchema = z.object({
  notes: z.string().max(500).optional(),
});

export const cancelPurchaseOrderSchema = z.object({
  reason: z.string().min(5, 'Cancellation reason must be at least 5 characters'),
});
