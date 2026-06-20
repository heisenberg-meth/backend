import { jest, describe, afterEach, it, expect } from '@jest/globals';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const prismaPath = path.resolve(__dirname, '../../src/config/prisma.js');

const mockPrisma = {
  manufacturer: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
  },
};

jest.unstable_mockModule(prismaPath, () => ({
  default: mockPrisma,
}));

const { default: manufacturerRepository } =
  await import('../../src/modules/manufacturers/repositories/manufacturer.repository.js');

describe('ManufacturerRepository Unit Tests', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('findAll', () => {
    it('should query manufacturers and map medicineCount correctly', async () => {
      const tenantId = 'tenant-1';
      mockPrisma.manufacturer.findMany.mockResolvedValue([
        { id: '1', name: 'Pfizer', _count: { medicines: 15 } },
        { id: '2', name: 'Moderna', _count: { medicines: 10 } },
      ]);

      const result = await manufacturerRepository.findAll(tenantId);

      expect(mockPrisma.manufacturer.findMany).toHaveBeenCalledWith({
        where: { tenantId, deletedAt: null },
        include: {
          _count: { select: { medicines: { where: { deletedAt: null } } } },
        },
        orderBy: { name: 'asc' },
      });
      expect(result).toHaveLength(2);
      expect(result[0].medicineCount).toBe(15);
      expect(result[1].medicineCount).toBe(10);
    });
  });

  describe('findById', () => {
    it('should query single manufacturer and map medicineCount correctly', async () => {
      const tenantId = 'tenant-1';
      const mfrId = 'mfr-123';
      mockPrisma.manufacturer.findFirst.mockResolvedValue({
        id: mfrId,
        name: 'Pfizer',
        _count: { medicines: 25 },
        medicines: [],
      });

      const result = await manufacturerRepository.findById(mfrId, tenantId);

      expect(mockPrisma.manufacturer.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: mfrId, tenantId, deletedAt: null },
        }),
      );
      expect(result.medicineCount).toBe(25);
    });
  });
});
