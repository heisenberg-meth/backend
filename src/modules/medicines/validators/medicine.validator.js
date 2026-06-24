import { z } from 'zod';

export const MEDICINE_TYPES = [
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
];

export const DOSAGE_FORMS = [
  'TABLET',
  'CAPSULE',
  'SYRUP',
  'INJECTION',
  'DROPS',
  'INHALER',
  'CREAM',
  'OINTMENT',
  'GEL',
  'LOTION',
  'SPRAY',
  'POWDER',
  'GRANULES',
  'PATCH',
  'SUPPOSITORY',
  'SUSPENSION',
  'EMULSION',
  'SOLUTION',
  'TINCTURE',
];

export const SCHEDULE_TYPES = ['OTC', 'SCHEDULE_H', 'SCHEDULE_H1', 'SCHEDULE_X'];

export const PURCHASE_UNITS = ['BOX', 'CARTON', 'BOTTLE', 'TUBE', 'PIECE'];

export const SELLING_UNITS = ['TABLET', 'CAPSULE', 'STRIP', 'BOTTLE', 'TUBE', 'PIECE', 'VIAL'];

export const GST_PERCENTAGES = [0, 5, 12, 18, 28];

export const MEDICINE_STATUSES = ['ACTIVE', 'INACTIVE', 'DISCONTINUED'];

const hsnRegex = /^\d{4,8}$/;

export const createMedicineSchema = z.object({
  medicineName: z.string().min(1, 'Medicine name is required'),
  genericName: z.string().min(1, 'Generic name is required'),
  brandName: z.string().optional(),
  manufacturer: z.string().min(1, 'Manufacturer is required'),
  categoryId: z.string().uuid('Invalid category ID'),
  category: z.string().optional(),
  medicineType: z.enum(MEDICINE_TYPES, {
    errorMap: () => ({ message: `Medicine type must be one of: ${MEDICINE_TYPES.join(', ')}` }),
  }),
  dosageForm: z.string().refine((val) => DOSAGE_FORMS.includes(val), {
    message: `Invalid dosage form. Must be one of: ${DOSAGE_FORMS.join(', ')}`,
  }),
  strength: z.string().min(1, 'Strength is required'),
  schedule: z.enum(SCHEDULE_TYPES, {
    errorMap: () => ({ message: `Schedule must be one of: ${SCHEDULE_TYPES.join(', ')}` }),
  }).optional(),
  purchaseUnit: z.enum(PURCHASE_UNITS, {
    errorMap: () => ({ message: `Purchase unit must be one of: ${PURCHASE_UNITS.join(', ')}` }),
  }).optional(),
  sellingUnit: z.enum(SELLING_UNITS, {
    errorMap: () => ({ message: `Selling unit must be one of: ${SELLING_UNITS.join(', ')}` }),
  }).optional(),
  unitPerPack: z.number().int().min(1, 'Unit per pack must be greater than 0').optional(),
  gstPercentage: z.number().refine((val) => GST_PERCENTAGES.includes(val), {
    message: `GST percentage must be one of: ${GST_PERCENTAGES.join(', ')}`,
  }),
  hsnCode: z.string().regex(hsnRegex, 'Invalid HSN code format (4-8 digits)').optional(),
  barcode: z.string().optional(),
  sku: z.string().optional(),
  requiresPrescription: z.boolean().default(false),
  storageCondition: z.string().optional(),
  status: z.enum(MEDICINE_STATUSES, {
    errorMap: () => ({ message: `Status must be one of: ${MEDICINE_STATUSES.join(', ')}` }),
  }).default('ACTIVE'),
  notes: z.string().optional(),
  // Legacy fields for backward compatibility
  name: z.string().optional(),
  scheduleType: z.string().optional(),
  composition: z.string().optional(),
  description: z.string().optional(),
});

export const updateMedicineSchema = z.object({
  medicineName: z.string().min(1).optional(),
  genericName: z.string().min(1).optional(),
  brandName: z.string().optional(),
  manufacturer: z.string().min(1).optional(),
  categoryId: z.string().uuid().optional(),
  category: z.string().optional(),
  medicineType: z.enum(MEDICINE_TYPES).optional(),
  dosageForm: z.string().refine((val) => DOSAGE_FORMS.includes(val), {
    message: `Invalid dosage form. Must be one of: ${DOSAGE_FORMS.join(', ')}`,
  }).optional(),
  strength: z.string().min(1).optional(),
  schedule: z.enum(SCHEDULE_TYPES).optional(),
  purchaseUnit: z.enum(PURCHASE_UNITS).optional(),
  sellingUnit: z.enum(SELLING_UNITS).optional(),
  unitPerPack: z.number().int().min(1).optional(),
  gstPercentage: z.number().refine((val) => GST_PERCENTAGES.includes(val)).optional(),
  hsnCode: z.string().regex(hsnRegex).optional(),
  barcode: z.string().optional(),
  sku: z.string().optional(),
  requiresPrescription: z.boolean().optional(),
  storageCondition: z.string().optional(),
  status: z.enum(MEDICINE_STATUSES).optional(),
  notes: z.string().optional(),
  // Legacy fields for backward compatibility
  name: z.string().optional(),
  scheduleType: z.string().optional(),
  composition: z.string().optional(),
  description: z.string().optional(),
});

export const medicineQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  categoryId: z.string().uuid().optional(),
  manufacturerId: z.string().uuid().optional(),
  lowStock: z.coerce.boolean().optional(),
  nearExpiry: z.coerce.boolean().optional(),
  prescriptionRequired: z.coerce.boolean().optional(),
  branchId: z.string().uuid().optional(),
  sortBy: z.enum(['name', 'createdAt', 'unitPrice', 'reorderLevel']).default('name'),
  order: z.enum(['asc', 'desc']).default('asc'),
});

export const searchQuerySchema = z.object({
  q: z.string().min(1, 'Search query is required'),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const nearExpiryQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).default(30),
});
