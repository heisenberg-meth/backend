import { describe, it, expect } from '@jest/globals';

const {
  validateGstin,
  validateDrugLicense,
  validatePan,
  validatePhone,
  validateEmail,
  validatePincode,
  validateLogoUrl,
} = await import('../../../src/modules/store-profile/validators/store-profile.validator.js');

describe('StoreProfile Validators', () => {
  describe('validateGstin', () => {
    it('should return valid for null/undefined', () => {
      expect(validateGstin(null)).toEqual({ valid: true, error: null });
      expect(validateGstin(undefined)).toEqual({ valid: true, error: null });
    });

    it('should reject GSTIN with wrong length', () => {
      const result = validateGstin('29ABCDE1234F1Z');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('15 characters');
    });

    it('should reject GSTIN with invalid state code', () => {
      const result = validateGstin('99ABCDE1234F1Z5');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('state code');
    });

    it('should reject GSTIN with invalid PAN structure', () => {
      const result = validateGstin('29AB1234567F1Z5');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('PAN structure');
    });

    it('should reject GSTIN with non-Z at position 14', () => {
      const result = validateGstin('29ABCDE1234F1X5');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('position 14 must be "Z"');
    });

    it('should validate a correct GSTIN with checksum', () => {
      const result = validateGstin('29ABCDE1234F1Z4');
      expect(result.valid).toBe(true);
      expect(result.stateCode).toBe('29');
      expect(result.pan).toBe('ABCDE1234F');
    });

    it('should normalize lowercase GSTIN', () => {
      const result = validateGstin('29abcde1234f1z4');
      expect(result.valid).toBe(true);
    });
  });

  describe('validateDrugLicense', () => {
    it('should return valid for null/undefined', () => {
      expect(validateDrugLicense(null)).toEqual({ valid: true, error: null });
    });

    it('should accept DL-YYYY-NNN format', () => {
      const result = validateDrugLicense('DL-2026-001');
      expect(result.valid).toBe(true);
    });

    it('should accept DL/YYYY/NNN format', () => {
      const result = validateDrugLicense('DL/2026/001');
      expect(result.valid).toBe(true);
    });

    it('should accept DLNNNNNNNNNN format', () => {
      const result = validateDrugLicense('DL2026000001');
      expect(result.valid).toBe(true);
    });

    it('should accept XX-DL-YYYY-NNN format', () => {
      const result = validateDrugLicense('KA-DL-2026-001');
      expect(result.valid).toBe(true);
    });

    it('should reject invalid format', () => {
      const result = validateDrugLicense('INVALID-LICENSE');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid drug license format');
    });
  });

  describe('validatePan', () => {
    it('should return valid for null/undefined', () => {
      expect(validatePan(null)).toEqual({ valid: true, error: null });
    });

    it('should accept valid PAN', () => {
      const result = validatePan('ABCDE1234F');
      expect(result.valid).toBe(true);
      expect(result.pan).toBe('ABCDE1234F');
    });

    it('should reject invalid PAN format', () => {
      const result = validatePan('ABC1234DEF');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid PAN format');
    });
  });

  describe('validatePhone', () => {
    it('should return valid for null/undefined', () => {
      expect(validatePhone(null)).toEqual({ valid: true, error: null });
    });

    it('should accept valid Indian phone', () => {
      expect(validatePhone('+919876543210').valid).toBe(true);
      expect(validatePhone('9876543210').valid).toBe(true);
    });

    it('should reject invalid phone', () => {
      const result = validatePhone('abc');
      expect(result.valid).toBe(false);
    });
  });

  describe('validateEmail', () => {
    it('should return valid for null/undefined', () => {
      expect(validateEmail(null)).toEqual({ valid: true, error: null });
    });

    it('should accept valid email', () => {
      expect(validateEmail('test@example.com').valid).toBe(true);
    });

    it('should reject invalid email', () => {
      expect(validateEmail('invalid-email').valid).toBe(false);
    });
  });

  describe('validatePincode', () => {
    it('should return valid for null/undefined', () => {
      expect(validatePincode(null)).toEqual({ valid: true, error: null });
    });

    it('should accept valid pincode', () => {
      expect(validatePincode('572101').valid).toBe(true);
    });

    it('should reject invalid pincode', () => {
      expect(validatePincode('12345').valid).toBe(false);
    });
  });

  describe('validateLogoUrl', () => {
    it('should return valid for null/undefined', () => {
      expect(validateLogoUrl(null)).toEqual({ valid: true, error: null });
    });

    it('should accept valid URL', () => {
      expect(validateLogoUrl('https://cdn.example.com/logo.png').valid).toBe(true);
    });

    it('should reject invalid URL', () => {
      expect(validateLogoUrl('not-a-url').valid).toBe(false);
    });
  });
});
