import { z } from 'zod';

export const MedicineStatus = z.enum([
  'ACTIVE',
  'INACTIVE',
  'DISCONTINUED',
  'BLOCKED',
  'RESTRICTED',
  'RECALLED',
]);

export const MedicineType = z.enum([
  'TABLET',
  'CAPSULE',
  'SYRUP',
  'SUSPENSION',
  'INJECTION',
  'DROPS',
  'CREAM',
  'GEL',
  'OINTMENT',
  'POWDER',
  'INHALER',
  'SPRAY',
  'MEDICAL_DEVICE',
]);

export const ScheduleType = z.enum(['OTC', 'SCHEDULE_H', 'SCHEDULE_H1', 'SCHEDULE_X']);

export const PurchaseUnit = z.enum(['BOX', 'CARTON', 'BOTTLE', 'TUBE', 'PIECE']);

export const SellingUnit = z.enum(['TABLET', 'CAPSULE', 'STRIP', 'BOTTLE', 'TUBE', 'PIECE', 'VIAL']);

export const StorageCondition = z.enum(['ROOM_TEMPERATURE', 'COLD_STORAGE', 'PROTECT_FROM_LIGHT']);

export const GST_PERCENTAGES = [0, 5, 12, 18, 28];

// Medicine Master Schema - No stock, no batch, no supplier
export const CreateMedicineSchema = z.object({
  medicineName: z.string().min(1, 'Medicine name is required'),
  genericName: z.string().min(1, 'Generic name is required'),
  brandName: z.string().optional(),
  manufacturer: z.string().min(1, 'Manufacturer is required'),
  categoryId: z.string().uuid('Invalid category ID'),
  category: z.string().optional(),
  medicineType: MedicineType,
  dosageForm: z.string().min(1, 'Dosage form is required'),
  strength: z.string().min(1, 'Strength is required'),
  schedule: ScheduleType.optional(),
  purchaseUnit: PurchaseUnit.optional(),
  sellingUnit: SellingUnit.optional(),
  unitPerPack: z.number().int().min(1, 'Unit per pack must be greater than 0').optional(),
  gstPercentage: z.number().refine((val) => GST_PERCENTAGES.includes(val), {
    message: `GST percentage must be one of: ${GST_PERCENTAGES.join(', ')}`,
  }),
  hsnCode: z.string().optional(),
  barcode: z.string().optional(),
  sku: z.string().optional(),
  requiresPrescription: z.boolean().default(false),
  storageCondition: z.string().optional(),
  status: MedicineStatus.default('ACTIVE'),
  notes: z.string().optional(),
});

export const UpdateMedicineSchema = CreateMedicineSchema.partial();

// Inventory Batch Schema - For creating stock
export const CreateBatchSchema = z.object({
  medicineId: z.string().uuid('Invalid medicine ID'),
  supplierId: z.string().uuid('Invalid supplier ID'),
  batchNumber: z.string().min(1, 'Batch number is required'),
  expiryDate: z.string({ required_error: 'Expiry date is required' }),
  purchasePrice: z.number().min(0, 'Purchase price must be non-negative'),
  mrp: z.number().min(0, 'MRP must be non-negative'),
  sellingPrice: z.number().min(0, 'Selling price must be non-negative'),
  quantity: z.number().int().min(1, 'Quantity must be greater than 0'),
  rackLocation: z.string().optional(),
}).refine(
  (data) => {
    if (data.mrp <= data.purchasePrice) return false;
    return true;
  },
  {
    message: 'MRP must be greater than purchase price',
    path: ['mrp'],
  },
).refine(
  (data) => {
    if (data.sellingPrice > data.mrp) return false;
    return true;
  },
  {
    message: 'Selling price cannot exceed MRP',
    path: ['sellingPrice'],
  },
).refine(
  (data) => {
    if (new Date(data.expiryDate) <= new Date()) return false;
    return true;
  },
  {
    message: 'Expiry date must be a future date',
    path: ['expiryDate'],
  },
);

// Legacy schemas for backward compatibility
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

// Response Schemas
export const MedicineResponseSchema = z.object({
  id: z.string().uuid(),
  medicineName: z.string(),
  genericName: z.string().nullable(),
  brandName: z.string().nullable(),
  manufacturer: z.string().nullable(),
  medicineType: MedicineType.nullable(),
  dosageForm: z.string().nullable(),
  strength: z.string().nullable(),
  schedule: ScheduleType.nullable(),
  purchaseUnit: PurchaseUnit.nullable(),
  sellingUnit: SellingUnit.nullable(),
  unitPerPack: z.number().nullable(),
  gstPercentage: z.number(),
  hsnCode: z.string().nullable(),
  barcode: z.string().nullable(),
  sku: z.string().nullable(),
  requiresPrescription: z.boolean(),
  storageCondition: z.string().nullable(),
  status: MedicineStatus,
  notes: z.string().nullable(),
  isActive: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
  category: z.object({ id: z.string(), name: z.string() }).nullable().optional(),
});

export const BatchResponseSchema = z.object({
  id: z.string().uuid(),
  batchNumber: z.string(),
  expiryDate: z.string(),
  purchasePrice: z.number(),
  mrp: z.number(),
  sellingPrice: z.number(),
  availableQuantity: z.number(),
  quantity: z.number(),
  rackLocation: z.string().nullable(),
  supplier: z.object({ id: z.string(), name: z.string() }).nullable().optional(),
});
