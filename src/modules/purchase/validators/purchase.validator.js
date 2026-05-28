import { z } from 'zod';

export const supplierSchema = z.object({
  name: z.string().min(1),
  contactPerson: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional(),
  gstNumber: z.string().optional(),
  drugLicenseNumber: z.string().optional(),
  address: z.string().optional(),
});

export const poSchema = z.object({
  supplierId: z.string().uuid(),
  expectedDeliveryDate: z.string().optional(),
  notes: z.string().optional(),
  items: z
    .array(
      z.object({
        medicineId: z.string().uuid(),
        quantity: z.number().int().positive(),
        purchasePrice: z.number().min(0),
        gstPercentage: z.number().min(0).max(100).optional(),
      }),
    )
    .min(1),
});

export const receiveGoodsSchema = z.object({
  supplierId: z.string().uuid(),
  purchaseOrderId: z.string().uuid().optional(),
  supplierInvoiceNumber: z.string().min(1),
  invoiceDate: z.string(),
  subtotal: z.number().min(0),
  gstAmount: z.number().min(0),
  totalAmount: z.number().min(0),
  invoicePdfUrl: z.string().url().optional().or(z.literal('')),
  items: z.array(z.object({
    medicineId: z.string().uuid(),
    batchNumber: z.string().min(1),
    quantity: z.number().int().positive(),
    expiryDate: z.string(),
    purchasePrice: z.number().min(0),
    sellingPrice: z.number().min(0),
  })).min(1),
});

export const supplierReturnSchema = z.object({
  supplierId: z.string().uuid(),
  batchId: z.string().uuid(),
  quantity: z.number().int().positive(),
  reason: z.string().min(1),
});
