import { z } from 'zod';

export const patientSchema = z.object({
  fullName: z.string().min(1),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER']).optional(),
  dateOfBirth: z.string().optional(),
  address: z.string().optional(),
});

export const prescriptionSchema = z.object({
  patientId: z.string().uuid(),
  doctorName: z.string().optional(),
  prescriptionDate: z.string(),
  notes: z.string().optional(),
  prescriptionFileUrl: z.string().url().optional().or(z.literal('')),
  items: z
    .array(
      z.object({
        medicineId: z.string().uuid(),
        dosage: z.string().optional(),
        durationDays: z.number().int().positive().optional(),
        instructions: z.string().optional(),
      }),
    )
    .min(1),
});

export const redeemLoyaltySchema = z.object({
  patientId: z.string().uuid(),
  points: z.number().int().positive(),
});

export const insuranceSchema = z.object({
  insuranceProvider: z.string().min(1),
  insurancePolicyNo: z.string().min(1),
  insuranceCoveragePercentage: z.number().min(0).max(100).optional(),
});

export const adherenceSchema = z.object({
  medicineId: z.string().uuid().optional(),
  medicineName: z.string().optional(),
  scheduledTime: z.string().optional(),
  takenTime: z.string().optional(),
  taken: z.boolean().optional(),
  dosage: z.string().optional(),
  notes: z.string().optional(),
});
