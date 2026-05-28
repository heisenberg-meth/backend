import { z } from 'zod';

export const printInvoiceSchema = z.object({
  body: z.object({
    printerType: z.enum(['THERMAL_58MM', 'THERMAL_80MM', 'A4', 'BARCODE', 'QR']).default('A4'),
    copies: z.number().int().min(1).max(10).default(1),
    printerEndpoint: z.string().url().optional(),
  }),
  params: z.object({
    id: z.string().uuid(),
  }),
});

export const generatePdfSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
  query: z.object({
    watermark: z.string().optional(),
    duplicateCopy: z.enum(['true', 'false']).optional(),
  }),
});

export const whatsappInvoiceSchema = z.object({
  body: z.object({
    phoneNumber: z.string().regex(/^\+?[1-9]\d{1,14}$/),
  }),
  params: z.object({
    id: z.string().uuid(),
  }),
});

export const emailInvoiceSchema = z.object({
  body: z.object({
    email: z.string().email(),
  }),
  params: z.object({
    id: z.string().uuid(),
  }),
});

export const downloadPdfSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
  query: z.object({
    expiresIn: z.string().regex(/^\d+$/).optional(),
  }),
});

export const resendInvoiceSchema = z.object({
  body: z.object({
    channels: z.array(z.enum(['email', 'whatsapp'])).min(1),
    email: z.string().email().optional(),
    phoneNumber: z.string().regex(/^\+?[1-9]\d{1,14}$/).optional(),
  }),
  params: z.object({
    id: z.string().uuid(),
  }),
});

export const bulkPrintSchema = z.object({
  body: z.object({
    invoiceIds: z.array(z.string().uuid()).min(1).max(100),
    printerType: z.enum(['THERMAL_58MM', 'THERMAL_80MM', 'A4', 'BARCODE', 'QR']).default('A4'),
    copies: z.number().int().min(1).max(10).default(1),
  }),
});

export const regeneratePdfSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
  body: z.object({
    watermark: z.string().optional(),
    reason: z.string().optional(),
  }),
});

export const printHistorySchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
  query: z.object({
    page: z.string().regex(/^\d+$/).optional(),
    limit: z.string().regex(/^\d+$/).optional(),
  }),
});
