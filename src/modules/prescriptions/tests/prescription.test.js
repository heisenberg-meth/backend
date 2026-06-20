import { jest, describe, beforeEach, it, expect } from '@jest/globals';

jest.unstable_mockModule('../../../config/prisma.js', () => ({
  default: {
    prescription: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      groupBy: jest.fn(),
    },
    prescriptionItem: {
      createMany: jest.fn(),
    },
    prescriptionVerification: {
      create: jest.fn(),
    },
    invoice: {
      findMany: jest.fn(),
    },
    medicineReminder: {
      create: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
    },
    $transaction: jest.fn((fn) =>
      fn({ prescription: { update: jest.fn() }, prescriptionVerification: { create: jest.fn() } }),
    ),
  },
}));

jest.unstable_mockModule('../../../shared/utils/logger.js', () => ({
  default: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

jest.unstable_mockModule('../../../shared/events/local-event-bus.js', () => ({
  emitLocalEvent: jest.fn(),
}));

const emitLocalEvent = (await import('../../../shared/events/local-event-bus.js')).emitLocalEvent;

const mockPrisma = (await import('../../../config/prisma.js')).default;
const ocrService = (await import('../services/ocr.service.js')).default;
const complianceService = (await import('../services/compliance.service.js')).default;
const prescriptionService = (await import('../services/prescription.service.js')).default;
const prescriptionEvents = await import('../events/prescription.events.js');

function mockPrescription(overrides = {}) {
  return {
    id: 'rx-1',
    prescriptionNumber: 'RX-2026-00001',
    tenantId: 'tenant-1',
    patientId: 'pat-1',
    doctorId: 'doc-1',
    doctorName: 'Dr. Kumar',
    prescriptionDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
    status: 'ACTIVE',
    verificationStatus: 'PENDING',
    refillCount: 0,
    refillMax: 3,
    notes: null,
    deletedAt: null,
    patient: { fullName: 'Rahul' },
    doctor: { doctorName: 'Dr. Kumar', registrationNumber: 'MH12345' },
    items: [
      {
        id: 'rxi-1',
        medicineId: 'med-1',
        dosage: '1 tablet twice daily',
        frequency: 'BD',
        durationDays: 5,
        quantity: 10,
        dispensedQuantity: 0,
        refillEligible: true,
        medicine: { name: 'Paracetamol 650', scheduleType: 'OTC', hsnCode: '300490' },
        instructions: 'After food',
      },
    ],
    verifications: [],
    invoices: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('OcrService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('extracts medicines from handwritten-like text', async () => {
    const result = await ocrService.processOcr(
      'Patient: Rahul\nDr. Kumar\nDolo 650 - 1 tab BD x 5 days\nAzithral 500',
      't1',
    );
    expect(result.extractedMedicines.length).toBeGreaterThanOrEqual(2);
    expect(result.detectedDoctor).toBe('Kumar');
    expect(result.detectedPatient).toBe('Rahul');
  });

  it('matches fuzzy medicine names', async () => {
    const result = await ocrService.processOcr('Doloo 650', 't1');
    expect(result.extractedMedicines.some((m) => m.matchedMedicine.includes('Dolo'))).toBe(true);
  });

  it('handles empty text', async () => {
    await expect(ocrService.processOcr('', 't1')).rejects.toThrow('No text');
  });

  it('detects dosage patterns', async () => {
    const result = await ocrService.processOcr('Paracetamol 1 tab twice daily x 5 days', 't1');
    expect(result.detectedDosages.length).toBeGreaterThan(0);
    expect(result.detectedFrequencies.length).toBeGreaterThan(0);
  });

  it('returns low confidence for unrecognized text', async () => {
    const result = await ocrService.processOcr('Random text with no medicine names', 't1');
    expect(result.confidence).toBeLessThan(0.5);
  });
});

describe('PrescriptionComplianceService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects expired prescriptions', () => {
    expect(
      complianceService.checkPrescriptionValidity({
        status: 'EXPIRED',
        deletedAt: null,
      }).valid,
    ).toBe(false);
  });

  it('rejects archived prescriptions', () => {
    expect(
      complianceService.checkPrescriptionValidity({
        status: 'ARCHIVED',
        deletedAt: new Date(),
      }).valid,
    ).toBe(false);
  });

  it('rejects old prescriptions beyond dispensing window', () => {
    const oldPrescription = {
      status: 'ACTIVE',
      deletedAt: null,
      prescriptionDate: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
      items: [{ medicine: { scheduleType: 'OTC' } }],
    };
    expect(complianceService.checkPrescriptionValidity(oldPrescription).valid).toBe(false);
  });

  it('flags Schedule X as critical compliance issue', () => {
    const result = complianceService.checkMedicineCompliance(
      { prescriptionId: 'rx-1' },
      { name: 'Schedule X Drug', scheduleType: 'X', prescriptionRequired: true },
    );
    expect(result.compliant).toBe(false);
    expect(result.issues.some((i) => i.severity === 'CRITICAL')).toBe(true);
  });

  it('passes OTC medicine compliance', () => {
    const result = complianceService.checkMedicineCompliance(
      { prescriptionId: 'rx-1' },
      { name: 'Paracetamol', scheduleType: 'OTC', prescriptionRequired: false },
    );
    expect(result.compliant).toBe(true);
  });

  it('rejects unverified prescriptions for dispensing', async () => {
    const result = await complianceService.validatePrescriptionForDispensing(
      mockPrescription({ verificationStatus: 'PENDING' }),
    );
    expect(result.valid).toBe(false);
  });

  it('rejects rejected prescriptions for dispensing', async () => {
    const result = await complianceService.validatePrescriptionForDispensing(
      mockPrescription({ verificationStatus: 'REJECTED' }),
    );
    expect(result.valid).toBe(false);
  });

  it('passes verified prescription for dispensing', async () => {
    const result = await complianceService.validatePrescriptionForDispensing(
      mockPrescription({ verificationStatus: 'VERIFIED' }),
    );
    expect(result.valid).toBe(true);
  });

  it('detects Schedule X quantity restrictions', () => {
    const result = complianceService.checkDispensingRestrictions(
      { scheduleType: 'X', storageCondition: 'ROOM_TEMPERATURE' },
      60,
    );
    expect(result.restricted).toBe(true);
  });
});

describe('PrescriptionService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('archives prescription instead of hard delete', async () => {
    mockPrisma.prescription.findUnique.mockResolvedValue(mockPrescription());
    mockPrisma.prescription.update.mockResolvedValue({
      ...mockPrescription(),
      status: 'ARCHIVED',
      deletedAt: new Date(),
    });

    const result = await prescriptionService.archivePrescription('rx-1');
    expect(result.status).toBe('ARCHIVED');
    expect(mockPrisma.prescription.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'ARCHIVED' }) }),
    );
  });

  it('rejects update to prescribed medicines', async () => {
    mockPrisma.prescription.findUnique.mockResolvedValue(mockPrescription());

    await expect(
      prescriptionService.updatePrescription(
        'rx-1',
        {
          items: [{ medicineId: 'new-med' }],
        },
        'user-1',
      ),
    ).rejects.toThrow('No editable fields');
  });

  it('allows update to notes only', async () => {
    mockPrisma.prescription.findUnique.mockResolvedValue(mockPrescription());
    mockPrisma.prescription.update.mockResolvedValue(mockPrescription());

    const result = await prescriptionService.updatePrescription(
      'rx-1',
      {
        notes: 'Doctor confirmed dosage',
      },
      'user-1',
    );
    expect(result).toBeDefined();
  });

  it('throws for nonexistent prescription on archive', async () => {
    mockPrisma.prescription.findUnique.mockResolvedValue(null);
    await expect(prescriptionService.archivePrescription('nonexistent')).rejects.toThrow(
      'not found',
    );
  });

  it('throws when converting unverified prescription to invoice', async () => {
    mockPrisma.prescription.findUnique.mockResolvedValue(
      mockPrescription({ verificationStatus: 'PENDING' }),
    );

    await expect(prescriptionService.convertToInvoice('rx-1', 'user-1')).rejects.toThrow(
      'must be verified',
    );
  });

  it('converts verified prescription to invoice draft', async () => {
    mockPrisma.prescription.findUnique.mockResolvedValue(
      mockPrescription({ verificationStatus: 'VERIFIED' }),
    );

    const result = await prescriptionService.convertToInvoice('rx-1', 'user-1');
    expect(result.readyForBilling).toBe(true);
    expect(result.items[0].remainingQuantity).toBe(10);
  });
});

describe('PrescriptionEvents', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('emits PRESCRIPTION_CREATED on create', () => {
    prescriptionEvents.emitPrescriptionCreated('rx-1', 'RX-001', 'pat-1', 't1');
    expect(emitLocalEvent).toHaveBeenCalledWith(
      expect.stringContaining('prescription.created'),
      expect.any(Object),
    );
  });

  it('emits PRESCRIPTION_VERIFIED on verify', () => {
    prescriptionEvents.emitPrescriptionVerified('rx-1', 'user-1');
    expect(emitLocalEvent).toHaveBeenCalledWith(
      expect.stringContaining('prescription.verified'),
      expect.any(Object),
    );
  });
});
