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
    returnType: z
      .enum([
        'CUSTOMER_RETURN',
        'DAMAGED_RETURN',
        'BILLING_CORRECTION',
        'EXPIRED_RETURN',
        'PARTIAL_RETURN',
      ])
      .optional(),
    items: z
      .array(
        z.object({
          invoiceItemId: z.string().uuid(),
          quantity: z.number().int().positive(),
          disposition: z
            .enum(['PENDING', 'RESTOCK', 'DESTROY', 'QUARANTINE', 'SUPPLIER_RETURN'])
            .optional(),
        }),
      )
      .min(1),
    refundMethod: z.enum(['CASH', 'UPI', 'STORE_CREDIT', 'BANK_TRANSFER']).optional(),
    notes: z.string().max(500).optional(),
    branchId: z.string().uuid().optional(),
  }),
});
