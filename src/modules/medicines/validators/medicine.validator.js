import { z } from 'zod';

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

export const GST_PERCENTAGES = [0, 5, 12, 18, 28];

const hsnRegex = /^\d{4,8}$/;

export const createMedicineSchema = z.object({
  medicineName: z.string().min(1, 'Medicine name is required'),
  genericName: z.string().optional().default(''),
  categoryId: z.string().uuid('Invalid category ID'),
  manufacturerId: z.string().uuid('Invalid manufacturer ID'),
  dosageForm: z.string().refine((val) => DOSAGE_FORMS.includes(val), {
    message: `Invalid dosage form. Must be one of: ${DOSAGE_FORMS.join(', ')}`,
  }),
  packagingType: z.string().optional(),
  strength: z.string().optional().default(''),
  barcode: z.string().optional().default(''),
  sku: z.string().optional().default(''),
  hsnCode: z
    .string()
    .regex(hsnRegex, 'Invalid HSN code format (4-8 digits)')
    .optional()
    .default(''),
  gstPercentage: z.coerce
    .number()
    .refine((val) => GST_PERCENTAGES.includes(val), {
      message: `Invalid GST percentage. Must be one of: ${GST_PERCENTAGES.join(', ')}`,
    })
    .default(0),
  unitPrice: z.coerce.number().min(0, 'Unit price must be non-negative').default(0),
  reorderLevel: z.coerce.number().int().min(0, 'Reorder level must be non-negative').default(10),
  rackLocation: z.string().optional().default(''),
  description: z.string().optional().default(''),
  prescriptionRequired: z.boolean().default(false),
  isActive: z.boolean().default(true),
});

export const updateMedicineSchema = z.object({
  medicineName: z.string().min(1).optional(),
  genericName: z.string().optional(),
  categoryId: z.string().uuid().optional(),
  manufacturerId: z.string().uuid().optional(),
  dosageForm: z
    .string()
    .refine((val) => DOSAGE_FORMS.includes(val), {
      message: `Invalid dosage form. Must be one of: ${DOSAGE_FORMS.join(', ')}`,
    })
    .optional(),
  packagingType: z.string().optional(),
  strength: z.string().optional(),
  barcode: z.string().optional(),
  sku: z.string().optional(),
  hsnCode: z.string().regex(hsnRegex).optional(),
  gstPercentage: z.coerce
    .number()
    .refine((val) => GST_PERCENTAGES.includes(val))
    .optional(),
  unitPrice: z.coerce.number().min(0).optional(),
  reorderLevel: z.coerce.number().int().min(0).optional(),
  rackLocation: z.string().optional(),
  description: z.string().optional(),
  prescriptionRequired: z.boolean().optional(),
  isActive: z.boolean().optional(),
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
