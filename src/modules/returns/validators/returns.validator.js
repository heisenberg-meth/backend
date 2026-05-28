import { z } from 'zod';

export const createReturnSchema = z.object({
  body: z.object({
    invoiceId: z.string().uuid(),
    saleId: z.string().uuid().optional(),
    reason: z.enum([
      'CUSTOMER_RETURN',
      'DAMAGED_RETURN',
      'BILLING_CORRECTION',
      'EXPIRED_RETURN',
      'PARTIAL_RETURN',
    ]),
    returnType: z.enum([
      'CUSTOMER_RETURN',
      'DAMAGED_RETURN',
      'BILLING_CORRECTION',
      'EXPIRED_RETURN',
      'PARTIAL_RETURN',
    ]).optional(),
    items: z
      .array(
        z.object({
          invoiceItemId: z.string().uuid(),
          quantity: z.number().int().positive(),
          disposition: z
            .enum(['PENDING', 'RESTOCK', 'DESTROY', 'QUARANTINE', 'SUPPLIER_RETURN'])
            .optional(),
        })
      )
      .min(1),
    refundMethod: z.enum(['CASH', 'UPI', 'STORE_CREDIT', 'BANK_TRANSFER']).optional(),
    notes: z.string().max(500).optional(),
    branchId: z.string().uuid().optional(),
  }),
});

export const approveReturnSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
  body: z.object({
    notes: z.string().max(500).optional(),
  }),
});

export const rejectReturnSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
  body: z.object({
    reason: z.string().min(1).max(500),
  }),
});

export const generateCreditNoteSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
  body: z.object({
    notes: z.string().max(500).optional(),
  }),
});

export const processRefundSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
  body: z.object({
    refundMethod: z.enum(['CASH', 'UPI', 'STORE_CREDIT', 'BANK_TRANSFER']),
    transactionId: z.string().optional(),
  }),
});

export const processDispositionSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
  body: z.object({
    dispositions: z
      .record(
        z.string().uuid(),
        z.enum(['RESTOCK', 'DESTROY', 'QUARANTINE', 'SUPPLIER_RETURN'])
      )
      .optional(),
  }),
});

export const getReturnsSchema = z.object({
  query: z.object({
    status: z
      .enum(['REQUESTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'REFUNDED', 'COMPLETED'])
      .optional(),
    reason: z
      .enum([
        'CUSTOMER_RETURN',
        'DAMAGED_RETURN',
        'BILLING_CORRECTION',
        'EXPIRED_RETURN',
        'PARTIAL_RETURN',
      ])
      .optional(),
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
    search: z.string().max(100).optional(),
    page: z.string().regex(/^\d+$/).transform(Number).default('1'),
    limit: z.string().regex(/^\d+$/).transform(Number).default('20'),
  }),
});

export const getReturnByIdSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
});

export const retryRefundSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
  body: z.object({
    refundMethod: z.enum(['CASH', 'UPI', 'STORE_CREDIT', 'BANK_TRANSFER']),
    transactionId: z.string().optional(),
  }),
});
