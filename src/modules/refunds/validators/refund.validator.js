import { z } from 'zod';

export const createRefundSchema = z.object({
  body: z.object({
    invoiceId: z.string().uuid(),
    items: z.array(z.object({
      invoiceItemId: z.string().uuid(),
      quantity: z.number().int().positive(),
    })).min(1, 'At least one item required'),
    reason: z.string().min(1).max(500).optional(),
    branchId: z.string().uuid().optional(),
  }),
});

export const approveRefundSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
  body: z.object({
    notes: z.string().optional(),
  }).optional(),
});

export const rejectRefundSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
  body: z.object({
    reason: z.string().min(1, 'Rejection reason required'),
  }),
});

export const getRefundsSchema = z.object({
  query: z.object({
    status: z.string().optional(),
    patientId: z.string().uuid().optional(),
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    limit: z.string().regex(/^\d+$/).optional(),
    offset: z.string().regex(/^\d+$/).optional(),
  }),
});

export const getRefundByIdSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
});

export const refundAnalyticsSchema = z.object({
  query: z.object({
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  }),
});
