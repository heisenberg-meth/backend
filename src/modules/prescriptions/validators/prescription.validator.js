import { z } from 'zod';

export const createPrescriptionSchema = z.object({
  body: z.object({
    patientId: z.string().uuid(),
    doctorId: z.string().uuid().optional(),
    doctorName: z.string().optional(),
    prescriptionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    notes: z.string().optional(),
    items: z.array(z.object({
      medicineId: z.string().uuid(),
      dosage: z.string().optional(),
      frequency: z.string().optional(),
      durationDays: z.number().int().positive().optional(),
      quantity: z.number().int().positive(),
      refillEligible: z.boolean().optional(),
      instructions: z.string().optional(),
    })).min(1, 'At least one medicine item required'),
  }),
});

export const updatePrescriptionSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z.object({
    notes: z.string().optional(),
    pharmacistNotes: z.string().optional(),
  }),
});

export const verifyPrescriptionSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z.object({
    status: z.enum(['VERIFIED', 'REJECTED']),
    rejectionReason: z.string().optional(),
  }),
});

export const getPrescriptionsSchema = z.object({
  query: z.object({
    status: z.string().optional(),
    verificationStatus: z.string().optional(),
    patientId: z.string().uuid().optional(),
    doctorId: z.string().uuid().optional(),
    verified: z.string().optional(),
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    limit: z.string().regex(/^\d+$/).optional(),
    offset: z.string().regex(/^\d+$/).optional(),
  }),
});

export const getPrescriptionByIdSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
});

export const deletePrescriptionSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
});

export const ocrSchema = z.object({
  body: z.object({
    text: z.string().min(1, 'OCR text required'),
  }),
});

export const convertToInvoiceSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
});

export const recordDispensingSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z.object({
    items: z.array(z.object({
      medicineId: z.string().uuid(),
      quantity: z.number().int().positive(),
    })).min(1),
  }),
});
