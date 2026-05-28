import { jest , describe, afterEach, it, expect } from '@jest/globals';

const mockPrescriptionRepository = {
  findById: jest.fn(),
  updateStatus: jest.fn(),
  createPrescription: jest.fn(),
  createVerification: jest.fn()
};

const mockAuditService = {
  log: jest.fn(),
};

jest.unstable_mockModule('../../src/modules/prescriptions/repositories/prescription.repository.js', () => ({
  default: mockPrescriptionRepository
}));

jest.unstable_mockModule('../../src/modules/audit/service/audit.prisma.service.js', () => ({
  default: mockAuditService,
}));

jest.unstable_mockModule('../../src/shared/events/erp-event-bus.js', () => ({
  emitEvent: jest.fn().mockResolvedValue(undefined),
  erpEventBus: { add: jest.fn(), close: jest.fn() },
}));

jest.unstable_mockModule('../../src/shared/events/local-event-bus.js', () => ({
  emitLocalEvent: jest.fn(),
  localEventBus: { removeAllListeners: jest.fn() },
}));

jest.unstable_mockModule('../../src/shared/constants/state-machines.js', () => ({
  prescriptionStateMachine: {
    transition: jest.fn((status, action) => {
      if (action === 'VERIFY') return 'VERIFIED';
      if (action === 'REJECT') return 'REJECTED';
      return status;
    }),
  },
}));

const { default: prescriptionService } = await import('../../src/modules/prescriptions/services/prescription.service.js');
const { default: verificationService } = await import('../../src/modules/prescriptions/services/verification.service.js');

describe('Clinical Workflow Unit Tests', () => {
  const tenantId = 'tenant-1';
  const prescriptionId = 'p-1';
  const userId = 'u-1';

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('PrescriptionService.validatePrescription', () => {
    it('should validate verified and non-expired prescription', async () => {
      const today = new Date();
      mockPrescriptionRepository.findById.mockResolvedValue({
        id: prescriptionId,
        verificationStatus: 'VERIFIED',
        prescriptionDate: today
      });

      const result = await prescriptionService.validatePrescription(prescriptionId, tenantId);
      expect(result).toBe(true);
    });

    it('should throw error if status is PENDING', async () => {
      mockPrescriptionRepository.findById.mockResolvedValue({
        id: prescriptionId,
        verificationStatus: 'PENDING'
      });

      await expect(prescriptionService.validatePrescription(prescriptionId, tenantId))
        .rejects.toThrow('Prescription status is PENDING, not VERIFIED');
    });

    it('should throw error and auto-expire if more than 6 months old', async () => {
      const sevenMonthsAgo = new Date();
      sevenMonthsAgo.setMonth(sevenMonthsAgo.getMonth() - 7);

      mockPrescriptionRepository.findById.mockResolvedValue({
        id: prescriptionId,
        verificationStatus: 'VERIFIED',
        prescriptionDate: sevenMonthsAgo
      });

      await expect(prescriptionService.validatePrescription(prescriptionId, tenantId))
        .rejects.toThrow('Prescription has expired');
      
      expect(mockPrescriptionRepository.updateStatus).toHaveBeenCalledWith(prescriptionId, tenantId, 'EXPIRED');
    });
  });

  describe('VerificationService.verifyPrescription', () => {
    it('should verify and log audit', async () => {
      mockPrescriptionRepository.findById.mockResolvedValue({ id: prescriptionId, verificationStatus: 'UPLOADED' });
      
      await verificationService.verifyPrescription(tenantId, prescriptionId, userId);

      expect(mockPrescriptionRepository.updateStatus).toHaveBeenCalledWith(prescriptionId, tenantId, 'VERIFIED');
      expect(mockAuditService.log).toHaveBeenCalledWith(expect.objectContaining({
        action: 'VERIFY_PRESCRIPTION'
      }));
    });
  });
});
