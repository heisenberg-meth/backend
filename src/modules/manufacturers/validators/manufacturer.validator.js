import { z } from 'zod';

export const createManufacturerSchema = z.object({
  name: z.string().min(1, 'Manufacturer name is required'),
  contactEmail: z.string().email('Invalid email').optional().or(z.literal('')),
  phone: z.string().optional().default(''),
  address: z.string().optional().default(''),
  gstNumber: z.string().optional().default(''),
  licenseNumber: z.string().optional().default(''),
});

export const updateManufacturerSchema = z.object({
  name: z.string().min(1).optional(),
  contactEmail: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional(),
  address: z.string().optional(),
  gstNumber: z.string().optional(),
  licenseNumber: z.string().optional(),
});
