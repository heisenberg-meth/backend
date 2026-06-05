import { z } from 'zod';

export const medicineSearchSchema = z.object({
  query: z.object({
    q: z.string().min(1).max(200),
    limit: z.string().regex(/^\d+$/).transform(Number).default('20'),
    category: z.string().uuid().optional(),
    schedule: z.string().optional(),
    branchId: z.string().uuid().optional(),
    inStockOnly: z
      .enum(['true', 'false'])
      .transform((v) => v === 'true')
      .optional(),
  }),
});

export const fuzzySearchSchema = z.object({
  query: z.object({
    q: z.string().min(1).max(200),
    limit: z.string().regex(/^\d+$/).transform(Number).default('20'),
  }),
});

export const autocompleteSchema = z.object({
  query: z.object({
    prefix: z.string().min(1).max(100),
    limit: z.string().regex(/^\d+$/).transform(Number).default('10'),
  }),
});

export const barcodeLookupSchema = z.object({
  params: z.object({
    barcode: z.string().min(1).max(100),
  }),
});

export const skuLookupSchema = z.object({
  params: z.object({
    sku: z.string().min(1).max(100),
  }),
});

export const getAlternativesSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
  query: z.object({
    limit: z.string().regex(/^\d+$/).transform(Number).default('10'),
  }),
});

export const getAvailabilitySchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
});

export const popularSearchesSchema = z.object({
  query: z.object({
    limit: z.string().regex(/^\d+$/).transform(Number).default('20'),
  }),
});
