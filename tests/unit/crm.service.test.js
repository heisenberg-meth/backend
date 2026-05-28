import { jest , describe,afterEach, it, expect } from '@jest/globals';

const mockPatientRepository = {
  findById: jest.fn(),
  updateStats: jest.fn(),
  create: jest.fn(),
  getNextCustomerCode: jest.fn()
};

const mockLoyaltyRepository = {
  createTransaction: jest.fn()
};

const mockPrescriptionRepository = {
  createPrescription: jest.fn(),
};

const mockNotificationService = {
  sendSms: jest.fn(),
};

const mockPrisma = {
  $transaction: jest.fn(async (callback) => callback(mockPrisma)),
  patient: {
    update: jest.fn(),
  },
  tenant: {
    findMany: jest.fn(),
  },
  prescription: {
    findMany: jest.fn(),
  },
};

jest.unstable_mockModule('../../src/config/prisma.js', () => ({
  default: mockPrisma
}));

jest.unstable_mockModule('../../src/modules/patients/repositories/patient.repository.js', () => ({
  default: mockPatientRepository
}));

jest.unstable_mockModule('../../src/modules/patients/repositories/loyalty.repository.js', () => ({
  default: mockLoyaltyRepository
}));

jest.unstable_mockModule('../../src/modules/patients/repositories/prescription.repository.js', () => ({
  default: mockPrescriptionRepository
}));

jest.unstable_mockModule('../../src/modules/patients/services/notification.service.js', () => ({
  default: mockNotificationService
}));

const { default: loyaltyService } = await import('../../src/modules/patients/services/loyalty.service.js');
const { default: prescriptionService } =
  await import('../../src/modules/patients/services/prescription.service.js');
const { default: retentionService } = await import('../../src/modules/patients/services/retention.service.js');
const { default: recommendationService } = await import('../../src/modules/patients/services/recommendation.service.js');

describe('CRM Module Unit Tests', () => {
  const tenantId = 'tenant-1';
  const patientId = 'cust-1';

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('LoyaltyService.earnPoints', () => {
    it('should earn 1 point per ₹100 spent', async () => {
      await loyaltyService.earnPoints(tenantId, patientId, 450, 'inv-1', mockPrisma);

      expect(mockLoyaltyRepository.createTransaction).toHaveBeenCalledWith(expect.objectContaining({
        points: 4,
        type: 'EARN'
      }), mockPrisma);

      expect(mockPrisma.patient.update).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: patientId },
        data: { loyaltyPoints: { increment: 4 } }
      }));
    });
  });

  describe('LoyaltyService.redeemPoints', () => {
    it('should calculate discount correctly (100 points = ₹10)', async () => {
      mockPatientRepository.findById.mockResolvedValue({ id: patientId, loyaltyPoints: 500 });

      const discount = await loyaltyService.redeemPoints(tenantId, patientId, 200, mockPrisma);

      expect(discount).toBe(20);
      expect(mockPrisma.patient.update).toHaveBeenCalledWith(expect.objectContaining({
        data: { loyaltyPoints: { decrement: 200 } }
      }));
    });

    it('should throw error if insufficient points', async () => {
      mockPatientRepository.findById.mockResolvedValue({ id: patientId, loyaltyPoints: 50 });

      await expect(loyaltyService.redeemPoints(tenantId, patientId, 100, mockPrisma))
        .rejects.toThrow('Insufficient loyalty points');
    });
  });

  describe('LoyaltyService.expireOldPoints', () => {
    it('should expire points earned more than 1 year ago', async () => {
      mockPrisma.loyaltyTransaction = {
        findMany: jest.fn().mockResolvedValue([{ id: 'tx-1', patientId, points: 100 }]),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn()
      };
      mockPrisma.patient.findUnique = jest.fn().mockResolvedValue({ id: patientId, loyaltyPoints: 150, tenantId });

      await loyaltyService.expireOldPoints();

      expect(mockPrisma.loyaltyTransaction.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          type: 'EXPIRE',
          points: -100
        })
      }));
    });
  });

  describe('PrescriptionService.processRefillReminders', () => {
    it('should trigger refill reminder when duration is ending', async () => {
      mockPrisma.tenant.findMany.mockResolvedValue([{ id: tenantId }]);
      
      const prescriptionDate = new Date();
      prescriptionDate.setDate(prescriptionDate.getDate() - 7); // Prescribed 7 days ago

      mockPrisma.prescription.findMany.mockResolvedValue([
        {
          id: 'p-1',
          patientId,
          prescriptionDate,
          patient: { fullName: 'John Doe', phone: '1234567890' },
          items: [{ durationDays: 10 }] // Ends in 3 days from now
        }
      ]);

      await prescriptionService.processRefillReminders();

      expect(mockNotificationService.sendSms).toHaveBeenCalledWith(tenantId, expect.objectContaining({
        type: 'REFILL_REMINDER',
        phone: '1234567890'
      }));
    });
  });

  describe('RetentionService', () => {
    it('should identify chronic patients', async () => {
      mockPrisma.patient.findMany = jest.fn().mockResolvedValue([{ id: patientId, fullName: 'Chronic Pat' }]);
      
      const patients = await retentionService.getChronicPatients(tenantId);
      
      expect(patients).toHaveLength(1);
      expect(mockPrisma.patient.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({
          prescriptions: { _count: { gt: 2 } }
        })
      }));
    });
  });

  describe('RecommendationService', () => {
    it('should recommend medicines based on frequency', async () => {
      mockPrisma.sale = {
        findMany: jest.fn().mockResolvedValue([
          { items: [{ medicineId: 'med-1', medicine: { name: 'Med 1' } }] },
          { items: [{ medicineId: 'med-1', medicine: { name: 'Med 1' } }] }
        ])
      };
      
      const recommendations = await recommendationService.getReorderRecommendations(tenantId, patientId);
      
      expect(recommendations).toHaveLength(1);
      expect(recommendations[0].id).toBe('med-1');
      expect(recommendations[0].count).toBe(2);
    });
  });
});
