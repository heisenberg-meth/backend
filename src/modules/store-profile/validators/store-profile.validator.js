import { z } from 'zod';

const INDIAN_STATE_CODES = [
  '01', '02', '03', '04', '05', '06', '07', '08', '09', '10',
  '11', '12', '13', '14', '15', '16', '17', '18', '19', '20',
  '21', '22', '23', '24', '25', '26', '27', '28', '29', '30',
  '31', '32', '33', '34', '35', '36', '37', '38', '39', '40',
  '41', '42', '43', '44', '45', '46', '47', '48', '49', '50',
  '51', '52', '53', '54', '55', '56', '57', '58', '59', '60',
  '61', '62', '63', '64', '65', '66', '67', '68', '69', '70',
  '71', '72', '73', '74', '75', '76', '77', '78', '79', '80',
  '81', '82', '83', '84', '85', '86', '87', '88', '89', '90',
  '91', '92', '93', '94', '95', '96', '97',
];

const GSTIN_CHECKSUM_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

function validateGstinChecksum(gstin) {
  const codeMap = {};
  for (let i = 0; i < GSTIN_CHECKSUM_CHARS.length; i++) {
    codeMap[GSTIN_CHECKSUM_CHARS[i]] = i;
  }

  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const charCode = codeMap[gstin[i]];
    if (charCode === undefined) return false;
    const factor = i % 2 === 0 ? 1 : 2;
    const product = charCode * factor;
    sum += Math.floor(product / 36) + (product % 36);
  }

  const remainder = sum % 36;
  const expectedChecksum = GSTIN_CHECKSUM_CHARS[remainder];
  return gstin[14] === expectedChecksum;
}

export function validateGstin(gstin) {
  if (!gstin) return { valid: true, error: null };

  const normalized = gstin.trim().toUpperCase();

  if (normalized.length !== 15) {
    return { valid: false, error: 'GSTIN must be exactly 15 characters' };
  }

  const stateCode = normalized.substring(0, 2);
  if (!INDIAN_STATE_CODES.includes(stateCode)) {
    return { valid: false, error: `Invalid GSTIN state code: ${stateCode}` };
  }

  const panPattern = normalized.substring(2, 12);
  const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
  if (!panRegex.test(panPattern)) {
    return { valid: false, error: 'Invalid PAN structure in GSTIN (positions 3-12 must be AAAAA9999A)' };
  }

  const entityType = normalized[12];
  if (!/^[A-Z0-9]$/.test(entityType)) {
    return { valid: false, error: 'Invalid GSTIN entity type character (position 13)' };
  }

  if (normalized[13] !== 'Z') {
    return { valid: false, error: 'GSTIN position 14 must be "Z"' };
  }

  if (!validateGstinChecksum(normalized)) {
    return { valid: false, error: 'Invalid GSTIN checksum' };
  }

  return { valid: true, error: null, stateCode, pan: panPattern };
}

export function validateDrugLicense(licenseNumber) {
  if (!licenseNumber) return { valid: true, error: null };

  const patterns = [
    /^DL-\d{4}-\d{3,6}$/i,
    /^DL\/\d{4}\/\d{3,6}$/i,
    /^DL\d{10,15}$/i,
    /^[A-Z]{2}-DL-\d{4}-\d{3,6}$/i,
  ];

  const isValid = patterns.some((p) => p.test(licenseNumber.trim()));
  if (!isValid) {
    return {
      valid: false,
      error: 'Invalid drug license format. Expected: DL-YYYY-NNN, DL/YYYY/NNN, DLNNNNNNNNNN, or XX-DL-YYYY-NNN',
    };
  }

  return { valid: true, error: null };
}

export function validatePan(pan) {
  if (!pan) return { valid: true, error: null };

  const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
  if (!panRegex.test(pan.trim().toUpperCase())) {
    return { valid: false, error: 'Invalid PAN format. Expected: AAAAA9999A' };
  }

  return { valid: true, error: null, pan: pan.trim().toUpperCase() };
}

export function validatePhone(phone) {
  if (!phone) return { valid: true, error: null };

  const phoneRegex = /^\+?[0-9]{10,15}$/;
  if (!phoneRegex.test(phone.trim())) {
    return { valid: false, error: 'Invalid phone number. Expected 10-15 digits, optionally prefixed with +' };
  }

  return { valid: true, error: null };
}

export function validateEmail(email) {
  if (!email) return { valid: true, error: null };

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email.trim())) {
    return { valid: false, error: 'Invalid email format' };
  }

  return { valid: true, error: null };
}

export function validatePincode(pincode) {
  if (!pincode) return { valid: true, error: null };

  const pincodeRegex = /^[0-9]{6}$/;
  if (!pincodeRegex.test(pincode.trim())) {
    return { valid: false, error: 'Invalid pincode. Expected 6 digits' };
  }

  return { valid: true, error: null };
}

export function validateLogoUrl(url) {
  if (!url) return { valid: true, error: null };

  try {
    new URL(url);
    return { valid: true, error: null };
  } catch {
    return { valid: false, error: 'Invalid logo URL. Must be a valid URL' };
  }
}

export const addressSchema = z.object({
  line1: z.string().max(255).optional().nullable(),
  line2: z.string().max(255).optional().nullable(),
  city: z.string().max(100).optional().nullable(),
  state: z.string().max(100).optional().nullable(),
  stateCode: z.string().length(2).optional().nullable(),
  pincode: z.string().length(6).optional().nullable(),
  country: z.string().length(2).default('IN').optional(),
});

export const createStoreProfileSchema = z.object({
  branchId: z.string().uuid().optional().nullable(),
  storeName: z.string().min(1).max(255),
  legalName: z.string().max(255).optional().nullable(),
  tradeName: z.string().max(255).optional().nullable(),
  gstin: z.string().length(15).optional().nullable(),
  pan: z.string().length(10).optional().nullable(),
  drugLicenseNumber: z.string().max(100).optional().nullable(),
  drugLicenseExpiry: z.string().datetime().optional().nullable(),
  fssaiLicense: z.string().max(100).optional().nullable(),
  fssaiLicenseExpiry: z.string().datetime().optional().nullable(),
  phoneNumber: z.string().max(20).optional().nullable(),
  alternatePhone: z.string().max(20).optional().nullable(),
  email: z.string().email().optional().nullable(),
  supportEmail: z.string().email().optional().nullable(),
  website: z.string().url().optional().nullable(),
  addressLine1: z.string().max(255).optional().nullable(),
  addressLine2: z.string().max(255).optional().nullable(),
  city: z.string().max(100).optional().nullable(),
  state: z.string().max(100).optional().nullable(),
  stateCode: z.string().length(2).optional().nullable(),
  pincode: z.string().length(6).optional().nullable(),
  country: z.string().length(2).default('IN').optional(),
  logoUrl: z.string().url().optional().nullable(),
  invoiceLogoUrl: z.string().url().optional().nullable(),
  whatsappLogoUrl: z.string().url().optional().nullable(),
  brandColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional().nullable(),
  tagline: z.string().max(255).optional().nullable(),
});

export const updateStoreProfileSchema = createStoreProfileSchema.partial();

export const uploadDocumentSchema = z.object({
  documentType: z.enum(['GST_CERTIFICATE', 'DRUG_LICENSE', 'FSSAI_LICENSE', 'INCORPORATION', 'OTHER']),
  fileName: z.string().max(255),
  fileUrl: z.string().url(),
  fileSize: z.number().int().positive().optional(),
  mimeType: z.string().max(100).optional(),
  expiresAt: z.string().datetime().optional().nullable(),
});

export const localizationSchema = z.object({
  language: z.string().length(2),
  storeName: z.string().max(255).optional().nullable(),
  addressLine1: z.string().max(255).optional().nullable(),
  addressLine2: z.string().max(255).optional().nullable(),
  city: z.string().max(100).optional().nullable(),
  state: z.string().max(100).optional().nullable(),
  tagline: z.string().max(255).optional().nullable(),
  invoiceFooter: z.string().max(500).optional().nullable(),
});
