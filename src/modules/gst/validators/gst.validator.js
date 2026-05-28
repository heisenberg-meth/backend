import { z } from 'zod';

export const gstSummarySchema = z.object({
  query: z.object({
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    branchId: z.string().uuid().optional(),
    period: z.enum(['MONTHLY', 'YEARLY']).optional(),
  }),
});

export const gstReportsSchema = z.object({
  query: z.object({
    month: z.string().regex(/^\d{2}$/),
    year: z.string().regex(/^\d{4}$/),
    format: z.enum(['xlsx', 'csv', 'json']).default('xlsx'),
    branchId: z.string().uuid().optional(),
  }),
});

export const gstReconciliationSchema = z.object({
  query: z.object({
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  }),
});

export const hsnSummarySchema = z.object({
  query: z.object({
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  }),
});

export const gstAuditSchema = z.object({
  query: z.object({
    from: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    to: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    limit: z.string().regex(/^\d+$/).optional(),
  }),
});

export const gstExportSchema = z.object({
  body: z.object({
    month: z.number().int().min(1).max(12),
    year: z.number().int().min(2020).max(2100),
    format: z.enum(['xlsx', 'csv', 'json']).default('xlsx'),
  }),
});

export const generateMonthlySummarySchema = z.object({
  body: z.object({
    month: z.string().optional(),
  }),
});

export const gstTrendsSchema = z.object({
  query: z.object({
    months: z.string().regex(/^\d+$/).optional(),
  }),
});

export const gstBranchAnalyticsSchema = z.object({
  query: z.object({
    month: z.string().regex(/^\d{2}$/).optional(),
    year: z.string().regex(/^\d{4}$/).optional(),
  }),
});

export const gstItcSchema = z.object({
  query: z.object({
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  }),
});
