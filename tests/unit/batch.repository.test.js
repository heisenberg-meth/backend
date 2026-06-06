import { jest, describe, afterEach, it, expect } from '@jest/globals';

const mockPrisma = {
  inventoryBatch: {
    findMany: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockResolvedValue(0),
  },
};

jest.unstable_mockModule('../../src/config/prisma.js', () => ({
  default: mockPrisma,
}));

const { default: batchRepository } = await import('../../src/modules/batches/repositories/batch.repository.js');

describe('BatchRepository Unit Tests', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('findAll', () => {
    it('should correctly filter by medicineId when passed', async () => {
      const tenantId = 'tenant-1';
      const medicineId = '66ecb992-20f0-46f1-9349-09ddb667ff55';

      await batchRepository.findAll({
        tenantId,
        medicineId,
      });

      expect(mockPrisma.inventoryBatch.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            deletedAt: null,
            medicine: { tenantId },
            medicineId: '66ecb992-20f0-46f1-9349-09ddb667ff55',
          }),
        }),
      );
    });
  });
});
