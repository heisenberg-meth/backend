import { jest , describe, beforeEach, it, expect } from '@jest/globals';

jest.unstable_mockModule('../../../config/prisma.js', () => ({
  default: {
    patient: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    sale: {
      findMany: jest.fn(),
    },
    prescription: {
      findMany: jest.fn(),
    },
    invoice: {
      findMany: jest.fn(),
    },
    loyaltyTransaction: {
      findMany: jest.fn(),
      create: jest.fn(),
    },
    patientAdherence: {
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    patientAuditLog: {
      createMany: jest.fn(),
    },
    medicine: {
      findMany: jest.fn(),
    },
    smsNotification: {
      create: jest.fn().mockResolvedValue({ id: 'notif-1' }),
    },
  },
}));

jest.unstable_mockModule('../../../shared/utils/logger.js', () => ({
  default: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

jest.unstable_mockModule('../../../shared/events/local-event-bus.js', () => ({
  emitLocalEvent: jest.fn(),
}));

jest.unstable_mockModule('../../../queue/index.js', () => ({
  mainQueue: { add: jest.fn() },
}));

const mockPrisma = (await import('../../../config/prisma.js')).default;
const patientService = (await import('../services/patient.service.js')).default;
const complianceService = (await import('../services/patient-compliance.service.js')).default;
const analyticsService = (await import('../services/patient-analytics.service.js')).default;
const adherenceService = (await import('../services/patient-adherence.service.js')).default;
const patientRepository = (await import('../repositories/patient.repository.js')).default;

function mockPatient(overrides = {}) {
  return {
    id: 'pat-1',
    tenantId: 'tenant-1',
    patientCode: 'PAT-2026-0001',
    fullName: 'Rahul Sharma',
    phone: '9876543210',
    email: 'rahul@example.com',
    gender: 'MALE',
    dateOfBirth: new Date('1990-01-01'),
    age: 36,
    address: '123 Main St',
    medicalHistory: 'Asthma',
    allergies: ['penicillin', 'sulfa'],
    chronicConditions: ['diabetes', 'hypertension'],
    bloodGroup: 'O+',
    emergencyContact: null,
    insuranceProvider: null,
    insurancePolicyNo: null,
    insuranceCoveragePercentage: 0,
    loyaltyPoints: 150,
    totalSpent: 12500,
    totalVisits: 8,
    lastPurchaseDate: new Date('2026-05-15'),
    creditLimit: 5000,
    creditUsed: 1000,
    status: 'ACTIVE',
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    prescriptions: [],
    loyaltyTransactions: [],
    invoices: [],
    sales: [],
    patientAdherence: [],
    ...overrides,
  };
}

function mockAdherence(overrides = {}) {
  return {
    id: 'adh-1',
    tenantId: 'tenant-1',
    patientId: 'pat-1',
    medicineId: 'med-1',
    medicineName: 'Paracetamol',
    scheduledTime: new Date('2026-05-20T10:00:00Z'),
    takenTime: new Date('2026-05-20T10:30:00Z'),
    taken: true,
    dosage: '1 tablet',
    notes: null,
    createdAt: new Date(),
    ...overrides,
  };
}

describe('PatientComplianceService', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  it('detects allergy conflicts with prescribed medicines', async () => {
    mockPrisma.patient.findFirst.mockResolvedValue(mockPatient());
    mockPrisma.medicine.findMany.mockResolvedValue([
      { id: 'med-1', name: 'Penicillin V', genericName: 'penicillin' },
      { id: 'med-2', name: 'Paracetamol', genericName: 'acetaminophen' },
    ]);
    const result = await complianceService.checkAllergyInteractions('pat-1', 'tenant-1', ['med-1', 'med-2']);
    expect(result.safe).toBe(false);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0].allergy).toBe('penicillin');
  });

  it('returns safe when patient has no allergies', async () => {
    mockPrisma.patient.findFirst.mockResolvedValue(mockPatient({ allergies: null }));
    const result = await complianceService.checkAllergyInteractions('pat-1', 'tenant-1', ['med-1']);
    expect(result.safe).toBe(true);
    expect(result.conflicts).toEqual([]);
  });

  it('throws for non-existent patient', async () => {
    mockPrisma.patient.findFirst.mockResolvedValue(null);
    await expect(complianceService.checkAllergyInteractions('nonexistent', 'tenant-1', []))
      .rejects.toThrow('Patient not found');
  });

  it('validates insurance returns not valid when no info on file', async () => {
    mockPrisma.patient.findFirst.mockResolvedValue(mockPatient());
    const result = await complianceService.validateInsurance('pat-1', 'tenant-1');
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('No insurance information on file');
  });

  it('validates insurance is valid when info present', async () => {
    mockPrisma.patient.findFirst.mockResolvedValue(
      mockPatient({ insuranceProvider: 'ICICI Lombard', insurancePolicyNo: 'POL-12345', insuranceCoveragePercentage: 80 })
    );
    const result = await complianceService.validateInsurance('pat-1', 'tenant-1');
    expect(result.valid).toBe(true);
    expect(result.provider).toBe('ICICI Lombard');
    expect(result.coverage).toBe(80);
  });

  it('updates insurance information', async () => {
    mockPrisma.patient.findFirst.mockResolvedValue(mockPatient());
    mockPrisma.patient.update.mockResolvedValue(mockPatient());
    const result = await complianceService.updateInsurance('pat-1', 'tenant-1', {
      insuranceProvider: 'New India Assurance',
      insurancePolicyNo: 'POL-99999',
      insuranceCoveragePercentage: 75,
    }, 'admin@pharmacy.com');
    expect(result).toBeDefined();
    expect(mockPrisma.patient.update).toHaveBeenCalled();
  });

  it('generates compliance report with adherence rate', async () => {
    mockPrisma.patient.findFirst.mockResolvedValue(
      mockPatient({
        patientAdherence: [mockAdherence({ taken: true }), mockAdherence({ taken: true }), mockAdherence({ taken: false })],
        patientRefills: [],
      })
    );
    const report = await complianceService.getComplianceReport('pat-1', 'tenant-1');
    expect(report.adherenceRate).toBe(67);
    expect(report.allergies).toEqual(['penicillin', 'sulfa']);
    expect(report.activePrescriptions).toBe(0);
  });
});

describe('PatientAnalyticsService', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  it('returns comprehensive patient analytics', async () => {
    const enhancedPatient = {
      ...mockPatient(),
      _count: { prescriptions: 5, invoices: 8, sales: 8, returns: 1 },
      patientAdherence: [
        mockAdherence({ taken: true }),
        mockAdherence({ taken: true }),
        mockAdherence({ taken: true }),
        mockAdherence({ taken: false }),
      ],
    };
    mockPrisma.patient.findFirst.mockResolvedValue(enhancedPatient);
    const result = await analyticsService.getPatientAnalytics('pat-1', 'tenant-1');
    expect(result.totalPrescriptions).toBe(5);
    expect(result.totalSpent).toBe(12500);
    expect(result.adherenceRate).toBe(75);
    expect(result.chronicConditions).toContain('diabetes');
  });

  it('returns null adherence rate when no data', async () => {
    mockPrisma.patient.findFirst.mockResolvedValue({
      ...mockPatient(),
      _count: { prescriptions: 0, invoices: 0, sales: 0, returns: 0 },
      patientAdherence: [],
    });
    const result = await analyticsService.getPatientAnalytics('pat-1', 'tenant-1');
    expect(result.adherenceRate).toBeNull();
    expect(result.totalPrescriptions).toBe(0);
  });

  it('produces chronic intelligence with risk levels', async () => {
    mockPrisma.patient.findMany.mockResolvedValue([
      {
        id: 'pat-1',
        fullName: 'Rahul Sharma',
        chronicConditions: ['diabetes'],
        totalVisits: 10,
        lastPurchaseDate: new Date(),
        patientAdherence: [mockAdherence({ taken: true }), mockAdherence({ taken: true }), mockAdherence({ taken: false })],
        _count: { prescriptions: 3, invoices: 5 },
      },
    ]);
    const result = await analyticsService.getChronicIntelligence('tenant-1');
    expect(result).toHaveLength(1);
    expect(result[0].conditionCount).toBe(1);
    expect(result[0].risk).toBe('MEDIUM');
  });

  it('classifies high risk when adherence below 60%', async () => {
    mockPrisma.patient.findMany.mockResolvedValue([
      {
        id: 'pat-2',
        fullName: 'Test Patient',
        chronicConditions: ['hypertension'],
        totalVisits: 5,
        lastPurchaseDate: new Date(),
        patientAdherence: [mockAdherence({ taken: true }), mockAdherence({ taken: false }), mockAdherence({ taken: false })],
        _count: { prescriptions: 2, invoices: 3 },
      },
    ]);
    const result = await analyticsService.getChronicIntelligence('tenant-1');
    expect(result[0].risk).toBe('HIGH');
  });

  it('returns purchase patterns with segmentation', async () => {
    mockPrisma.patient.count.mockResolvedValueOnce(15).mockResolvedValueOnce(5).mockResolvedValueOnce(3).mockResolvedValueOnce(8);
    const result = await analyticsService.getPurchasePatterns('tenant-1');
    expect(result.frequent).toBe(15);
    expect(result.atRisk).toBe(5);
    expect(result.churned).toBe(3);
    expect(result.newPatients).toBe(8);
  });

  it('calculates demographics breakdown', async () => {
    mockPrisma.patient.findMany.mockResolvedValue([
      { gender: 'MALE', age: 30, bloodGroup: 'O+' },
      { gender: 'FEMALE', age: 25, bloodGroup: 'A+' },
      { gender: 'MALE', age: 45, bloodGroup: 'B+' },
      { gender: 'FEMALE', age: 70, bloodGroup: 'O+' },
      { gender: 'MALE', age: 10, bloodGroup: 'AB+' },
    ]);
    const result = await analyticsService.getDemographics('tenant-1');
    expect(result.total).toBe(5);
    expect(result.genderBreakdown.MALE).toBe(3);
    expect(result.ageGroups['19-35']).toBe(2);
    expect(result.ageGroups['0-18']).toBe(1);
    expect(result.ageGroups['65+']).toBe(1);
    expect(result.bloodGroups['O+']).toBe(2);
  });
});

describe('PatientAdherenceService', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  it('logs adherence entry', async () => {
    mockPrisma.patient.findFirst.mockResolvedValue(mockPatient());
    mockPrisma.patientAdherence.create.mockResolvedValue(mockAdherence());
    const result = await adherenceService.logAdherence('pat-1', 'tenant-1', {
      medicineId: 'med-1',
      medicineName: 'Paracetamol',
      taken: true,
      dosage: '1 tablet',
    });
    expect(result).toBeDefined();
    expect(mockPrisma.patientAdherence.create).toHaveBeenCalled();
  });

  it('throws for non-existent patient on adherence log', async () => {
    mockPrisma.patient.findFirst.mockResolvedValue(null);
    await expect(adherenceService.logAdherence('nonexistent', 'tenant-1', {}))
      .rejects.toThrow('Patient not found');
  });

  it('returns adherence history with summary', async () => {
    mockPrisma.patient.findFirst.mockResolvedValue(mockPatient());
    mockPrisma.patientAdherence.findMany.mockResolvedValue([
      mockAdherence({ taken: true }),
      mockAdherence({ taken: true }),
      mockAdherence({ taken: false }),
      mockAdherence({ taken: true }),
    ]);
    mockPrisma.patientAdherence.count.mockResolvedValue(4);
    const result = await adherenceService.getAdherenceHistory('pat-1', 'tenant-1', { days: 30 });
    expect(result.summary.totalDoses).toBe(4);
    expect(result.summary.takenDoses).toBe(3);
    expect(result.summary.adherenceRate).toBe(75);
    expect(result.totalPages).toBe(1);
  });

  it('returns empty summary when no adherence records exist', async () => {
    mockPrisma.patient.findFirst.mockResolvedValue(mockPatient());
    mockPrisma.patientAdherence.findMany.mockResolvedValue([]);
    mockPrisma.patientAdherence.count.mockResolvedValue(0);
    const result = await adherenceService.getAdherenceHistory('pat-1', 'tenant-1', { days: 30 });
    expect(result.summary.totalDoses).toBe(0);
    expect(result.summary.adherenceRate).toBeNull();
  });

  it('calculates adherence rate for last 30 days', async () => {
    mockPrisma.patientAdherence.findMany.mockResolvedValue([
      mockAdherence({ taken: true }),
      mockAdherence({ taken: true }),
      mockAdherence({ taken: false }),
    ]);
    const result = await adherenceService.getAdherenceRate('pat-1', 'tenant-1');
    expect(result.rate).toBe(67);
    expect(result.total).toBe(3);
    expect(result.taken).toBe(2);
  });

  it('returns null rate when no adherence data exists', async () => {
    mockPrisma.patientAdherence.findMany.mockResolvedValue([]);
    const result = await adherenceService.getAdherenceRate('pat-1', 'tenant-1');
    expect(result.rate).toBeNull();
    expect(result.total).toBe(0);
  });
});

describe('PatientService', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  it('returns prescriptions list for patient', async () => {
    mockPrisma.patient.findFirst.mockResolvedValue(mockPatient());
    mockPrisma.prescription.findMany.mockResolvedValue([
      { id: 'rx-1', items: [{ medicine: { name: 'Paracetamol' }, dosage: '1 tab' }], doctor: { doctorName: 'Dr. Kumar' } },
    ]);
    const result = await patientService.getPrescriptions('pat-1', 'tenant-1');
    expect(result.length).toBeGreaterThan(0);
  });

  it('returns loyalty info with history', async () => {
    mockPrisma.patient.findFirst.mockResolvedValue(mockPatient());
    mockPrisma.loyaltyTransaction.findMany.mockResolvedValue([
      { id: 'lt-1', type: 'EARN', points: 50 },
    ]);
    const result = await patientService.getLoyalty('pat-1', 'tenant-1');
    expect(result.points).toBe(150);
    expect(result.history).toHaveLength(1);
  });

  it('sends refill reminder', async () => {
    mockPrisma.patient.findFirst.mockResolvedValue(mockPatient());
    const result = await patientService.sendRefillReminder('pat-1', 'tenant-1');
    expect(result).toBeDefined();
  });

  it('throws on refill reminder when patient has no phone', async () => {
    mockPrisma.patient.findFirst.mockResolvedValue(mockPatient({ phone: null }));
    await expect(patientService.sendRefillReminder('pat-1', 'tenant-1'))
      .rejects.toThrow('does not have a phone number');
  });
});

describe('PatientRepository', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  describe('validatePhone', () => {
    it('rejects empty phone', () => {
      expect(patientRepository.validatePhone('').valid).toBe(false);
      expect(patientRepository.validatePhone(null).valid).toBe(false);
    });

    it('rejects short phone', () => {
      expect(patientRepository.validatePhone('12345').valid).toBe(false);
    });

    it('accepts valid phone', () => {
      expect(patientRepository.validatePhone('9876543210').valid).toBe(true);
    });
  });

  describe('validateAge', () => {
    it('accepts valid age', () => {
      expect(patientRepository.validateAge(25).valid).toBe(true);
    });

    it('rejects negative age', () => {
      expect(patientRepository.validateAge(-1).valid).toBe(false);
    });

    it('rejects over 150', () => {
      expect(patientRepository.validateAge(200).valid).toBe(false);
    });

    it('accepts null age', () => {
      expect(patientRepository.validateAge(null).valid).toBe(true);
    });
  });

  describe('getNextPatientCode', () => {
    it('generates first code of year', async () => {
      mockPrisma.patient.findFirst.mockResolvedValue(null);
      const code = await patientRepository.getNextPatientCode('tenant-1');
      expect(code).toMatch(/^PAT-\d{4}-0001$/);
    });

    it('increments last code of year', async () => {
      mockPrisma.patient.findFirst.mockResolvedValue({ patientCode: 'PAT-2026-0042' });
      const code = await patientRepository.getNextPatientCode('tenant-1');
      expect(code).toBe('PAT-2026-0043');
    });
  });
});
