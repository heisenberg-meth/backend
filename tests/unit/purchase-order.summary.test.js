import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockPrisma = {
  purchaseInvoice: {
    count: jest.fn(),
    aggregate: jest.fn(),
  },
  purchaseOrder: {
    count: jest.fn(),
    aggregate: jest.fn(),
  },
};

jest.unstable_mockModule('../../src/config/prisma.js', () => ({ default: mockPrisma }));
jest.unstable_mockModule('../../src/shared/utils/logger.js', () => ({
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const { default: purchaseOrderRepository } =
  await import('../../src/modules/purchase-orders/repository/purchase-order.prisma.repository.js');
const { default: purchaseOrderService } =
  await import('../../src/modules/purchase-orders/service/purchase-order.service.js');
const { default: purchaseOrderController } =
  await import('../../src/modules/purchase-orders/controller/purchase-order.fastify.controller.js');

describe('Purchase Order & Invoice Summary', () => {
  const tenantId = 'tenant-xyz';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Repository: getSummary', () => {
    it('should query prisma with tenantId filter and calculate summary metrics', async () => {
      // Mock counts for invoices
      // Total: 15, Pending: 3, Paid: 10, Partial: 1, Cancelled: 1
      mockPrisma.purchaseInvoice.count
        .mockResolvedValueOnce(15) // total
        .mockResolvedValueOnce(3) // pending
        .mockResolvedValueOnce(10) // paid
        .mockResolvedValueOnce(1) // partial
        .mockResolvedValueOnce(1); // cancelled

      mockPrisma.purchaseInvoice.aggregate.mockResolvedValueOnce({
        _sum: {
          balanceAmount: '125000.00',
          totalAmount: '150000.00',
        },
      });

      // Mock counts for orders
      // Total: 8, Pending: 4, Received: 3, Cancelled: 1
      mockPrisma.purchaseOrder.count
        .mockResolvedValueOnce(8) // total
        .mockResolvedValueOnce(4) // pending
        .mockResolvedValueOnce(3) // received
        .mockResolvedValueOnce(1); // cancelled

      mockPrisma.purchaseOrder.aggregate.mockResolvedValueOnce({
        _sum: {
          totalAmount: '45000.00',
          balanceAmount: '40000.00',
        },
      });

      const summary = await purchaseOrderRepository.getSummary(tenantId);

      // Verify PRD §6 top-level canonical fields
      expect(summary.totalPurchaseOrders).toBe(15);
      expect(summary.pendingPurchaseOrders).toBe(3);
      expect(summary.paidPurchaseOrders).toBe(10);
      expect(summary.cancelledPurchaseOrders).toBe(1);
      expect(summary.pendingValue).toBe(125000);

      // Verify detailed breakdowns
      expect(summary.invoices).toEqual({
        total: 15,
        pending: 3,
        paid: 10,
        partial: 1,
        cancelled: 1,
        pendingValue: 125000,
      });

      expect(summary.orders).toEqual({
        total: 8,
        pending: 4,
        completed: 3,
        cancelled: 1,
        pendingValue: 45000,
      });

      // Verify tenantId was passed in queries
      expect(mockPrisma.purchaseInvoice.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId }),
        }),
      );
      expect(mockPrisma.purchaseOrder.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId, deletedAt: null }),
        }),
      );
    });

    it('should support branchId filtering for multi-branch environments', async () => {
      const branchId = 'branch-001';

      mockPrisma.purchaseInvoice.count.mockResolvedValue(0);
      mockPrisma.purchaseInvoice.aggregate.mockResolvedValue({ _sum: {} });
      mockPrisma.purchaseOrder.count.mockResolvedValue(0);
      mockPrisma.purchaseOrder.aggregate.mockResolvedValue({ _sum: {} });

      await purchaseOrderRepository.getSummary(tenantId, branchId);

      expect(mockPrisma.purchaseOrder.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId, branchId }),
        }),
      );
    });
  });

  describe('Service: getSummary', () => {
    it('should delegate getSummary to repository', async () => {
      mockPrisma.purchaseInvoice.count.mockResolvedValue(0);
      mockPrisma.purchaseInvoice.aggregate.mockResolvedValue({ _sum: {} });
      mockPrisma.purchaseOrder.count.mockResolvedValue(0);
      mockPrisma.purchaseOrder.aggregate.mockResolvedValue({ _sum: {} });

      const result = await purchaseOrderService.getSummary(tenantId);
      expect(result).toBeDefined();
      expect(result.pendingPurchaseOrders).toBe(0);
    });
  });

  describe('Controller: getSummary', () => {
    it('should return 200 with summary data when successful', async () => {
      mockPrisma.purchaseInvoice.count
        .mockResolvedValueOnce(5)
        .mockResolvedValueOnce(2)
        .mockResolvedValueOnce(3)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0);
      mockPrisma.purchaseInvoice.aggregate.mockResolvedValueOnce({ _sum: { balanceAmount: 2500 } });
      mockPrisma.purchaseOrder.count
        .mockResolvedValueOnce(3)
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(2)
        .mockResolvedValueOnce(0);
      mockPrisma.purchaseOrder.aggregate.mockResolvedValueOnce({ _sum: { totalAmount: 1000 } });

      const req = {
        tenantId,
        query: {},
      };
      const reply = {
        send: jest.fn(),
        code: jest.fn().mockReturnThis(),
      };

      await purchaseOrderController.getSummary(req, reply);

      expect(reply.send).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          pendingPurchaseOrders: 2,
          totalPurchaseOrders: 5,
        }),
      });
    });

    it('should return 500 when database operation throws, rather than masking with 0', async () => {
      mockPrisma.purchaseInvoice.count.mockRejectedValueOnce(new Error('DB Connection Lost'));

      const req = {
        tenantId,
        query: {},
      };
      const reply = {
        send: jest.fn(),
        code: jest.fn().mockReturnThis(),
      };

      await purchaseOrderController.getSummary(req, reply);

      expect(reply.code).toHaveBeenCalledWith(500);
      expect(reply.send).toHaveBeenCalledWith({
        success: false,
        error: 'DB Connection Lost',
      });
    });
  });
});
