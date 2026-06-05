import { z } from 'zod';

// Valid GST slabs under Indian tax law
const VALID_GST_SLABS = [0, 0.25, 1, 3, 5, 12, 18, 28];

// Valid medicine tax categories
export const GST_CATEGORIES = [
  'OTC',
  'ESSENTIAL_MEDICINES',
  'LIFE_SAVING_DRUGS',
  'SURGICAL_EQUIPMENT',
  'COSMETICS',
  'NUTRACEUTICALS',
  'AYUSH',
  'CONTRAST_MEDIA',
  'VACCINES',
  'BLOOD_PRODUCTS',
  'CUSTOM',
];

export const gstCategorySchema = z.enum(GST_CATEGORIES);

// Single GST category entry
export const gstCategoryEntrySchema = z.object({
  category: gstCategorySchema,
  gstPercentage: z.number().min(0).max(28),
});

// GST settings update payload
export const updateGstSettingsSchema = z.object({
  defaultGST: z.number().min(0).max(28).optional(),
  igstEnabled: z.boolean().optional(),
  categories: z.array(gstCategoryEntrySchema).min(1).max(20).optional(),
  branchId: z.string().uuid().optional().nullable(),
  effectiveFrom: z.string().datetime().optional(),
  notes: z.string().max(500).optional(),
});

// GST category validation (no duplicates)
export function validateNoDuplicateCategories(categories) {
  const seen = new Set();
  for (const cat of categories) {
    if (seen.has(cat.category)) {
      return {
        valid: false,
        error: `Duplicate GST category: "${cat.category}". Each category can only have one tax mapping.`,
      };
    }
    seen.add(cat.category);
  }
  return { valid: true };
}

// Validate GST percentage is a legal slab
export function validateGstSlab(percentage) {
  if (VALID_GST_SLABS.includes(percentage)) {
    return { valid: true };
  }
  return {
    valid: false,
    error: `Invalid GST slab: ${percentage}%. Legal slabs are: ${VALID_GST_SLABS.join(', ')}%`,
  };
}

// Validate GSTIN format (15 characters: 2 state + 10 PAN + 1 entity + 1 Z + 1 checksum)
export function validateGSTIN(gstin) {
  const gstinRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
  if (!gstin || gstinRegex.test(gstin)) {
    return { valid: true };
  }
  return {
    valid: false,
    error:
      'Invalid GSTIN format. Must be 15 characters: 2 digit state code + 10 char PAN + 1 entity + Z + checksum.',
  };
}

// Calculate CGST/SGST/IGST from GST percentage
export function calculateTaxBreakdown(taxableValue, gstPercentage, isInterState = false) {
  const gstAmount = taxableValue * (gstPercentage / 100);

  if (isInterState) {
    return {
      cgst: 0,
      sgst: 0,
      igst: gstAmount,
      total: gstAmount,
    };
  }

  const cgst = gstAmount / 2;
  const sgst = gstAmount / 2;
  return {
    cgst,
    sgst,
    igst: 0,
    total: gstAmount,
  };
}
