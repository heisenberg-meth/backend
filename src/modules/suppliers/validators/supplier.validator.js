import { z } from 'zod';
import { validateGst } from '../../../shared/utils/gst-validator.js';

const gstRefinement = (val, ctx) => {
  if (!val) return;
  const result = validateGst(val);
  if (!result.valid) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: result.error });
  }
};

const phoneRefinement = (val, ctx) => {
  if (!val) return;
  const cleaned = val.replace(/[\s\-+()]/g, '');
  if (cleaned.length < 10 || cleaned.length > 15) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Phone number must be 10-15 digits' });
  }
  if (!/^\+?\d+$/.test(cleaned)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Phone number must contain only digits and optional leading +' });
  }
};

const emailRefinement = (val, ctx) => {
  if (!val) return;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(val)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Invalid email format' });
  }
};

export const createSupplierSchema = z.object({
  name: z.string().min(1, 'Supplier name is required'),
  contactPerson: z.string().optional().default(''),
  email: z.string().optional().default('').superRefine(emailRefinement),
  phone: z.string().optional().default('').superRefine(phoneRefinement),
  gstNumber: z.string().optional().default('').superRefine(gstRefinement),
  drugLicenseNumber: z.string().optional().default(''),
  paymentTermsDays: z.coerce.number().int().min(0).optional().default(30),
  address: z.string().optional().default(''),
  leadTimeDays: z.coerce.number().int().min(1, 'Lead time must be at least 1 day').optional().default(7),
  rating: z.coerce.number().min(0).max(5).optional().default(0),
  status: z.enum(['ACTIVE', 'SUSPENDED', 'INACTIVE', 'BLOCKED', 'BLACKLISTED', 'ARCHIVED']).optional().default('ACTIVE'),
});

export const updateSupplierSchema = z.object({
  name: z.string().min(1).optional(),
  contactPerson: z.string().optional(),
  email: z.string().optional().superRefine(emailRefinement),
  phone: z.string().optional().superRefine(phoneRefinement),
  gstNumber: z.string().optional().superRefine(gstRefinement),
  drugLicenseNumber: z.string().optional(),
  paymentTermsDays: z.coerce.number().int().min(0).optional(),
  address: z.string().optional(),
  leadTimeDays: z.coerce.number().int().min(1).optional(),
  rating: z.coerce.number().min(0).max(5).optional(),
  status: z.enum(['ACTIVE', 'SUSPENDED', 'INACTIVE', 'BLOCKED', 'BLACKLISTED', 'ARCHIVED']).optional(),
});

export const listSupplierQuerySchema = z.object({
  search: z.string().optional(),
  status: z.string().optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
});

export const createPaymentSchema = z.object({
  paymentMethod: z.enum(['CASH', 'CHEQUE', 'BANK_TRANSFER', 'UPI', 'CARD', 'OTHER']),
  amount: z.coerce.number().positive('Amount must be positive'),
  paymentDate: z.string().optional().default(() => new Date().toISOString()),
  notes: z.string().optional().default(''),
  paymentReference: z.string().optional().default(''),
});

export const createSupplierPurchaseOrderSchema = z.object({
  branchId: z.string().optional(),
  expectedDeliveryDate: z.string().optional(),
  notes: z.string().optional().default(''),
  items: z.array(z.object({
    medicineId: z.string().min(1, 'Medicine ID is required'),
    quantity: z.coerce.number().int().positive('Quantity must be positive'),
    unitPrice: z.coerce.number().positive('Unit price must be positive'),
    gstPercentage: z.coerce.number().min(0).optional().default(0),
  })).min(1, 'At least one item is required'),
});

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
});
