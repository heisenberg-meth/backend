import { z } from 'zod';
import {
  SUPPORTED_EXPENSE_CATEGORIES,
  normalizeCategoryName,
} from '../constants/expense-categories.constant.js';

export const createExpenseSchema = z.object({
  body: z
    .object({
      category: z
        .string()
        .min(1, 'Category is required')
        .optional()
        .transform((val) => (val ? normalizeCategoryName(val) || val : val)),
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
    })
    .refine(
      (data) => {
        if (data.category) {
          return normalizeCategoryName(data.category) !== null;
        }
        return true;
      },
      {
        message: `Invalid category. Must be one of: ${SUPPORTED_EXPENSE_CATEGORIES.join(', ')}`,
        path: ['category'],
      },
    ),
});

export const updateExpenseSchema = z.object({
  body: z
    .object({
      category: z
        .string()
        .min(1, 'Category cannot be empty')
        .optional()
        .transform((val) => (val ? normalizeCategoryName(val) || val : val)),
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
    })
    .refine(
      (data) => {
        if (data.category) {
          return normalizeCategoryName(data.category) !== null;
        }
        return true;
      },
      {
        message: `Invalid category. Must be one of: ${SUPPORTED_EXPENSE_CATEGORIES.join(', ')}`,
        path: ['category'],
      },
    ),
});
