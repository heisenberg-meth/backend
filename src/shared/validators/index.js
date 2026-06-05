import { z } from 'zod';

export const registerSchema = z
  .object({
    email: z.string().email(),
    password: z.string().min(6),
    confirmPassword: z.string(),
    shopName: z.string().optional(),
    fullName: z.string().optional(),
    role: z.enum(['owner', 'staff']).default('owner'),
    fingerprint: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.password !== data.confirmPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Passwords do not match',
        path: ['confirmPassword'],
      });
    }
    if (data.role === 'owner' && (!data.shopName || data.shopName.trim() === '')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Shop name is required for owners',
        path: ['shopName'],
      });
    }
  });

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

export const medicineSchema = z.object({
  name: z.string(),
  itemCode: z.string().optional().or(z.literal('')),
  quantity: z.number().min(0).default(0),
  expiry: z.string().optional().or(z.literal('')),
  price: z.number().min(0).default(0),
  batchNumber: z.string().optional().or(z.literal('')),
  supplier: z.string().optional().or(z.literal('')),
});

export const orderSchema = z.object({
  supplier: z.string(),
  items: z.array(
    z.object({
      medicineName: z.string(),
      currentStock: z.number().optional(),
      reorderQty: z.number().optional(),
      unitPrice: z.number().optional(),
    }),
  ),
  totalAmount: z.number().optional(),
  notes: z.string().optional().or(z.literal('')),
});

export default { registerSchema, loginSchema, medicineSchema, orderSchema };
