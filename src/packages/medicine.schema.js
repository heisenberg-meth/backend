import { z } from 'zod';

export const MedicineStatus = z.enum([
  'ACTIVE',
  'INACTIVE',
  'DISCONTINUED',
  'BLOCKED',
  'RESTRICTED',
  'RECALLED',
]);

export const StorageCondition = z.enum(['ROOM_TEMPERATURE', 'COLD_STORAGE', 'PROTECT_FROM_LIGHT']);

export const InitialBatchSchema = z
  .object({
    batchNumber: z.string().min(1, 'Batch number is required'),
    quantity: z.number().int().min(0),
    expiryDate: z.string({ required_error: 'Expiry date is required' }),
    manufacturingDate: z.string({ required_error: 'Manufacturing date is required' }),
    purchasePrice: z.number().min(0).optional(),
    sellingPrice: z.number().min(0).optional(),
    mrp: z.number().min(0).optional(),
    supplierId: z.string({ required_error: 'Supplier is required' }).uuid('Invalid supplier ID'),
    purchaseInvoiceId: z.string().uuid().optional(),
    purchaseInvoiceNumber: z.string().optional(),
    purchaseDate: z.string().optional(),
    manufacturerName: z.string().optional(),
  })
  .refine(
    (data) => {
      if (!data.manufacturingDate || !data.expiryDate) return true;
      return new Date(data.manufacturingDate) <= new Date(data.expiryDate);
    },
    {
      message: 'Manufacturing Date cannot be after Expiry Date',
      path: ['manufacturingDate'],
    },
  );

export const CreateMedicineSchema = z.object({
  name: z.string().min(2),
  genericName: z.string().optional(),
  categoryId: z.string().uuid(),
  branchId: z.string().uuid(),
  gstPercentage: z.number(),
  reorderPoint: z.number(),
  reorderLevel: z.number(),
  initialBatch: z.object({
    batchNumber: z.string(),
    quantity: z.number(),
    expiryDate: z.string(),
    mrp: z.number(),
    purchasePrice: z.number(),
    sellingPrice: z.number(),
  }),
});

export const AddBatchSchema = z
  .object({
    branchId: z.string().uuid().optional(),
    batchNumber: z.string().min(1, 'Batch number is required'),
    quantity: z.number().int().min(0),
    expiryDate: z.string({ required_error: 'Expiry date is required' }),
    manufacturingDate: z.string({ required_error: 'Manufacturing date is required' }),
    purchasePrice: z.number().min(0).optional(),
    sellingPrice: z.number().min(0).optional(),
    mrp: z.number().min(0).optional(),
    supplierId: z.string({ required_error: 'Supplier is required' }).uuid('Invalid supplier ID'),
    purchaseInvoiceId: z.string().uuid().optional(),
    purchaseInvoiceNumber: z.string().optional(),
    purchaseDate: z.string().optional(),
    manufacturerName: z.string().optional(),
  })
  .refine(
    (data) => {
      if (!data.manufacturingDate || !data.expiryDate) return true;
      return new Date(data.manufacturingDate) <= new Date(data.expiryDate);
    },
    {
      message: 'Manufacturing Date cannot be after Expiry Date',
      path: ['manufacturingDate'],
    },
  );

export const CategorySchema = z.object({
  name: z.string().min(1, 'Category name is required'),
  description: z.string().optional(),
});

export const ManufacturerSchema = z.object({
  name: z.string().min(1, 'Manufacturer name is required'),
  contactEmail: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional(),
  address: z.string().optional(),
  licenseNumber: z.string().optional(),
  gstNumber: z.string().optional(),
});

export const UpdateMedicineSchema = CreateMedicineSchema.partial().extend({
  isActive: z.boolean().optional(),
});

export const MedicineResponseSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  genericName: z.string().nullable(),
  categoryId: z.string().nullable(),
  manufacturerId: z.string().nullable(),
  barcode: z.string().nullable(),
  sku: z.string().nullable(),
  dosageForm: z.string().nullable(),
  packagingType: z.string().nullable().optional(),
  strength: z.string().nullable(),
  gstPercentage: z.number(),
  description: z.string().nullable(),
  storageCondition: StorageCondition.nullable(),
  prescriptionRequired: z.boolean(),
  status: MedicineStatus,
  isActive: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),

  // Relations (simplified for now)
  category: z.object({ id: z.string(), name: z.string() }).nullable().optional(),
  manufacturer: z.object({ id: z.string(), name: z.string() }).nullable().optional(),
});
