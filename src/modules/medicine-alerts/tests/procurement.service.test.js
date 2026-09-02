import { jest, describe, beforeEach, it, expect } from '@jest/globals';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const prismaPath = path.resolve(__dirname, '../../../config/prisma.js');
const alertRepositoryPath = path.resolve(__dirname, '../repositories/alert.repository.js');
const forecastingServicePath = path.resolve(__dirname, '../forecasting/forecasting.service.js');
const erpEventBusPath = path.resolve(__dirname, '../../../shared/events/erp-event-bus.js');
const procurementServicePath = path.resolve(__dirname, '../procurement/procurement.service.js');

const mockPrisma = {
  medicineSupplier: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
  },
  medicine: {
    findUnique: jest.fn(),
  },
  purchaseOrder: {
    create: jest.fn(),
  },
};

const mockAlertRepository = {
  findLowStockAlerts: jest.fn(),
};

const mockForecastingService = {
  getReorderRecommendations: jest.fn(),
};

const mockErpEventBus = {
  emitEvent: jest.fn(),
};

// Use unstable_mockModule for ESM mocking
jest.unstable_mockModule(prismaPath, () => ({
  default: mockPrisma,
}));

jest.unstable_mockModule(alertRepositoryPath, () => ({
  default: mockAlertRepository,
}));

jest.unstable_mockModule(forecastingServicePath, () => ({
  default: mockForecastingService,
}));

jest.unstable_mockModule(erpEventBusPath, () => ({
  emitEvent: mockErpEventBus.emitEvent,
  DOMAIN_EVENTS: {
    PURCHASE_ORDER_CREATED: 'PURCHASE_ORDER_CREATED',
  },
}));

// Import modules AFTER mocking
const [
  { default: procurementService },
  { default: alertRepository },
  { default: forecastingService },
  { default: prisma },
] = await Promise.all([
  import(procurementServicePath),
  import(alertRepositoryPath),
  import(forecastingServicePath),
  import(prismaPath),
]);

describe('ProcurementIntegrationService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('generateReorderPOs', () => {
    it('should generate PO suggestions for low stock medicines', async () => {
      alertRepository.findLowStockAlerts.mockResolvedValue({
        alerts: [
          {
            medicineId: 'med-1',
            currentStock: 5,
            severity: 'CRITICAL',
            medicine: { name: 'Insulin' },
            branchId: 'branch-1',
          },
        ],
        pagination: { total: 1, page: 1, limit: 200, totalPages: 1 },
      });

      forecastingService.getReorderRecommendations.mockResolvedValue({
        recommendedOrderQuantity: 100,
        leadTime: 7,
        averageDailyUsage: 10,
      });

      prisma.medicineSupplier.findFirst.mockResolvedValue({
        supplierId: 'sup-1',
        averagePurchasePrice: 50,
        supplier: { name: 'PharmaCorp', email: 'orders@pharma.com' },
      });

      const result = await procurementService.generateReorderPOs('tenant-1');

      expect(result).toHaveLength(1);
      expect(result[0].medicineName).toBe('Insulin');
      expect(result[0].recommendedQuantity).toBe(100);
      expect(result[0].supplier).toBeDefined();
      expect(result[0].priority).toBe('CRITICAL');
    });

    it('should sort by priority (CRITICAL first)', async () => {
      alertRepository.findLowStockAlerts.mockResolvedValue({
        alerts: [
          { medicineId: 'med-1', currentStock: 10, severity: 'INFO', branchId: 'branch-1' },
          { medicineId: 'med-2', currentStock: 0, severity: 'CRITICAL', branchId: 'branch-1' },
          { medicineId: 'med-3', currentStock: 5, severity: 'WARNING', branchId: 'branch-1' },
        ],
        pagination: { total: 3, page: 1, limit: 200, totalPages: 1 },
      });

      forecastingService.getReorderRecommendations
        .mockResolvedValueOnce({ recommendedOrderQuantity: 50, leadTime: 7, averageDailyUsage: 5 })
        .mockResolvedValueOnce({
          recommendedOrderQuantity: 100,
          leadTime: 7,
          averageDailyUsage: 10,
        })
        .mockResolvedValueOnce({ recommendedOrderQuantity: 30, leadTime: 7, averageDailyUsage: 3 });

      prisma.medicineSupplier.findFirst.mockResolvedValue({
        supplierId: 'sup-1',
        averagePurchasePrice: 20,
        supplier: { name: 'Supplier' },
      });

      const result = await procurementService.generateReorderPOs('tenant-1');

      expect(result[0].priority).toBe('CRITICAL');
    });

    it('should skip medicines with no reorder recommendation', async () => {
      alertRepository.findLowStockAlerts.mockResolvedValue({
        alerts: [
          { medicineId: 'med-1', currentStock: 5, severity: 'WARNING', branchId: 'branch-1' },
        ],
        pagination: { total: 1, page: 1, limit: 200, totalPages: 1 },
      });

      forecastingService.getReorderRecommendations.mockResolvedValue(null);

      const result = await procurementService.generateReorderPOs('tenant-1');

      expect(result).toHaveLength(0);
    });
  });

  describe('createAutoPO', () => {
    it('should create a purchase order with correct calculations', async () => {
      forecastingService.getReorderRecommendations.mockResolvedValue({
        recommendedOrderQuantity: 100,
        leadTime: 7,
        averageDailyUsage: 10,
      });

      prisma.medicineSupplier.findFirst.mockResolvedValue({
        supplierId: 'sup-1',
        averagePurchasePrice: 50,
        supplier: { name: 'PharmaCorp', email: 'orders@pharma.com' },
      });

      prisma.medicine.findUnique.mockResolvedValue({
        name: 'Insulin',
        gstPercentage: 12,
      });

      prisma.purchaseOrder.create.mockResolvedValue({
        id: 'po-1',
        orderNumber: 'PO-TEST-001',
        supplierId: 'sup-1',
        status: 'DRAFT',
        subtotal: 5000,
        gstAmount: 600,
        totalAmount: 5600,
        supplier: { name: 'PharmaCorp', email: 'orders@pharma.com' },
        items: [{ medicine: { name: 'Insulin' }, quantity: 100 }],
      });

      const result = await procurementService.createAutoPO('tenant-1', 'med-1', 'branch-1');

      expect(result.orderNumber).toBeDefined();
      expect(result.subtotal).toBe(5000);
      expect(result.gstAmount).toBe(600);
      expect(result.totalAmount).toBe(5600);
    });

    it('should throw error when no preferred supplier', async () => {
      forecastingService.getReorderRecommendations.mockResolvedValue({
        recommendedOrderQuantity: 100,
        leadTime: 7,
      });

      prisma.medicineSupplier.findFirst.mockResolvedValue(null);

      await expect(procurementService.createAutoPO('tenant-1', 'med-1')).rejects.toThrow(
        'No preferred supplier found',
      );
    });

    it('should throw error when no reorder recommendation', async () => {
      forecastingService.getReorderRecommendations.mockResolvedValue(null);

      await expect(procurementService.createAutoPO('tenant-1', 'med-1')).rejects.toThrow(
        'No reorder recommendation available',
      );
    });
  });

  describe('getSupplierPerformance', () => {
    it('should aggregate supplier performance metrics', async () => {
      prisma.medicineSupplier.findMany.mockResolvedValue([
        {
          supplierId: 'sup-1',
          leadDays: 5,
          averagePurchasePrice: 50,
          isPreferred: true,
          supplier: {
            id: 'sup-1',
            name: 'PharmaCorp',
            rating: 4.5,
            leadTimeDays: 7,
            reliabilityScore: 90,
          },
          medicine: { name: 'Insulin' },
        },
        {
          supplierId: 'sup-1',
          leadDays: 8,
          averagePurchasePrice: 45,
          isPreferred: false,
          supplier: {
            id: 'sup-1',
            name: 'PharmaCorp',
            rating: 4.5,
            leadTimeDays: 7,
            reliabilityScore: 90,
          },
          medicine: { name: 'Dolo 650' },
        },
      ]);

      const result = await procurementService.getSupplierPerformance('tenant-1');

      expect(result).toHaveLength(1);
      expect(result[0].medicinesSupplied).toBe(2);
      expect(result[0].avgLeadDays).toBe(7);
    });
  });
});
