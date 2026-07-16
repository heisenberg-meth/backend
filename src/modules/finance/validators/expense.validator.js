import { z } from 'zod';

export const createExpenseSchema = z.object({
  body: z
    .object({
      category: z.string().min(1, 'Category is required').optional(),
      categoryId: z.string().optional(),
      amount: z
        .union([z.number(), z.string()])
        .transform((val) => Number(val))
        .refine((val) => !isNaN(val) && val > 0, 'Amount must be greater than zero'),
      description: z.string().optional().nullable(),
      title: z.string().optional().nullable(),
      notes: z.string().optional().nullable(),
      date: z.string().optional().nullable(),
      expenseDate: z.string().optional().nullable(),
      paymentMethod: z.string().optional().nullable(),
      via: z.string().optional().nullable(),
      receipt: z.union([z.string(), z.boolean()]).optional().nullable(),
      hasReceipt: z.boolean().optional().nullable(),
      attachmentUrl: z.string().optional().nullable(),
      invoiceNumber: z.string().optional().nullable(),
    })
    .refine((data) => data.category || data.categoryId || data.title || data.description, {
      message: 'Category or description is required',
      path: ['category'],
    }),
});

export const updateExpenseSchema = z.object({
  body: z.object({
    category: z.string().min(1, 'Category cannot be empty').optional(),
    categoryId: z.string().optional(),
    amount: z
      .union([z.number(), z.string()])
      .transform((val) => Number(val))
      .refine((val) => !isNaN(val) && val > 0, 'Amount must be greater than zero')
      .optional(),
    description: z.string().optional().nullable(),
    title: z.string().optional().nullable(),
    notes: z.string().optional().nullable(),
    date: z.string().optional().nullable(),
    expenseDate: z.string().optional().nullable(),
    paymentMethod: z.string().optional().nullable(),
    via: z.string().optional().nullable(),
    receipt: z.union([z.string(), z.boolean()]).optional().nullable(),
    hasReceipt: z.boolean().optional().nullable(),
    attachmentUrl: z.string().optional().nullable(),
    invoiceNumber: z.string().optional().nullable(),
  }),
});
