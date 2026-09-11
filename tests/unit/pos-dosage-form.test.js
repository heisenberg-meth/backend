import { describe, it, expect } from '@jest/globals';
import {
  DOSAGE_FORMS,
  formatDosageForm,
} from '../../../frontend/src/constants/medicine.constants.js';

describe('POS Medicine Type / Dosage Form Tests', () => {
  it('contains all PRD required dosage forms', () => {
    const requiredForms = [
      'Tablet',
      'Capsule',
      'Syrup',
      'Injection',
      'Cream',
      'Ointment',
      'Drops',
      'Inhaler',
      'Powder',
      'Sachet',
      'Suspension',
      'Solution',
      'Gel',
      'Spray',
      'Suppository',
      'Other',
    ];

    for (const form of requiredForms) {
      expect(DOSAGE_FORMS).toContain(form);
    }
  });

  describe('formatDosageForm', () => {
    it('formats uppercase enum values from DB (TABLET -> Tablet, CAPSULE -> Capsule)', () => {
      expect(formatDosageForm('TABLET')).toBe('Tablet');
      expect(formatDosageForm('CAPSULE')).toBe('Capsule');
      expect(formatDosageForm('SYRUP')).toBe('Syrup');
      expect(formatDosageForm('INJECTION')).toBe('Injection');
      expect(formatDosageForm('OINTMENT')).toBe('Ointment');
      expect(formatDosageForm('CREAM')).toBe('Cream');
      expect(formatDosageForm('GEL')).toBe('Gel');
    });

    it('formats lowercase strings (tablet -> Tablet, drops -> Drops)', () => {
      expect(formatDosageForm('tablet')).toBe('Tablet');
      expect(formatDosageForm('drops')).toBe('Drops');
      expect(formatDosageForm('powder')).toBe('Powder');
      expect(formatDosageForm('suspension')).toBe('Suspension');
    });

    it('returns null for missing, null, undefined, or blank values (triggers Type: Not specified)', () => {
      expect(formatDosageForm(null)).toBeNull();
      expect(formatDosageForm(undefined)).toBeNull();
      expect(formatDosageForm('')).toBeNull();
      expect(formatDosageForm('   ')).toBeNull();
    });

    it('converts unknown custom dosage forms to title case', () => {
      expect(formatDosageForm('SOFTGEL')).toBe('Softgel');
      expect(formatDosageForm('lotion')).toBe('Lotion');
    });
  });

  describe('Cart row display resolution simulation', () => {
    it('resolves type correctly from medicine master record or shows Type: Not specified', () => {
      const itemWithDosageForm = {
        name: 'Acyclovir 400mg',
        dosageForm: 'TABLET',
        price: 220,
        qty: 1,
      };
      const formatted1 = formatDosageForm(itemWithDosageForm.dosageForm);
      expect(formatted1).toBe('Tablet');

      const itemWithCapsule = {
        name: 'Acyclovir 400mg',
        medicineType: 'CAPSULE',
        price: 220,
        qty: 1,
      };
      const formatted2 = formatDosageForm(
        itemWithCapsule.dosageForm || itemWithCapsule.medicineType,
      );
      expect(formatted2).toBe('Capsule');

      const itemWithoutType = {
        name: 'Generic Paracetamol',
        price: 30,
        qty: 1,
      };
      const formatted3 = formatDosageForm(
        itemWithoutType.dosageForm || itemWithoutType.medicineType,
      );
      expect(formatted3).toBeNull();
      const displayLabel = formatted3 || 'Type: Not specified';
      expect(displayLabel).toBe('Type: Not specified');
    });
  });
});
