import { describe, it, expect } from '@jest/globals';
import { mapDosageFormToPackaging, validatePricing } from '../../src/shared/utils/medicine-helpers.js';

describe('Medicine Helpers Unit Tests', () => {
  describe('mapDosageFormToPackaging', () => {
    it('should map Tablet and Capsule to Strip', () => {
      expect(mapDosageFormToPackaging('Tablet')).toBe('Strip');
      expect(mapDosageFormToPackaging('tablet')).toBe('Strip');
      expect(mapDosageFormToPackaging('CAPSULE')).toBe('Strip');
    });

    it('should map Syrup and Drops to Bottle', () => {
      expect(mapDosageFormToPackaging('Syrup')).toBe('Bottle');
      expect(mapDosageFormToPackaging('drops')).toBe('Bottle');
    });

    it('should map Ointment, Cream, Gel to Tube', () => {
      expect(mapDosageFormToPackaging('Ointment')).toBe('Tube');
      expect(mapDosageFormToPackaging('cream')).toBe('Tube');
      expect(mapDosageFormToPackaging('GEL')).toBe('Tube');
    });

    it('should map Injection to Vial', () => {
      expect(mapDosageFormToPackaging('Injection')).toBe('Vial');
    });

    it('should fallback to Pack for unrecognized forms', () => {
      expect(mapDosageFormToPackaging('Inhaler')).toBe('Pack');
      expect(mapDosageFormToPackaging(null)).toBe('Pack');
    });
  });

  describe('validatePricing', () => {
    it('should pass on valid pricing', () => {
      expect(validatePricing({ purchasePrice: 10, sellingPrice: 12, mrp: 15 })).toBeNull();
      expect(validatePricing({ purchasePrice: 10, sellingPrice: 10, mrp: 11 })).toBeNull();
    });

    it('should reject purchase price <= 0', () => {
      expect(validatePricing({ purchasePrice: 0, sellingPrice: 12, mrp: 15 })).toBe('Purchase price must be greater than zero');
      expect(validatePricing({ purchasePrice: -5, sellingPrice: 12, mrp: 15 })).toBe('Purchase price must be greater than zero');
    });

    it('should reject MRP <= purchasePrice', () => {
      expect(validatePricing({ purchasePrice: 10, sellingPrice: 12, mrp: 10 })).toBe('MRP must be greater than purchase price');
      expect(validatePricing({ purchasePrice: 10, sellingPrice: 12, mrp: 8 })).toBe('MRP must be greater than purchase price');
    });

    it('should reject selling price < purchasePrice', () => {
      expect(validatePricing({ purchasePrice: 10, sellingPrice: 8, mrp: 15 })).toBe('Selling price must be greater than or equal to purchase price');
    });

    it('should reject selling price > MRP', () => {
      expect(validatePricing({ purchasePrice: 10, sellingPrice: 16, mrp: 15 })).toBe('Selling price cannot exceed MRP');
    });
  });
});
