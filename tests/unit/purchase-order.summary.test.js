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
    it('should calculate PO summary from PurchaseOrder (not invoices) per PRD §17-18 & §52', async () => {
      // 6 Purchase Orders:
      // total: 6, pending: 3 (APPROVED), approved: 3, received: 2, cancelled: 1
      mockPrisma.purchaseOrder.count
        .mockResolvedValueOnce(6) // totalOrders
        .mockResolvedValueOnce(3) // pendingOrders (e.g. APPROVED)
        .mockResolvedValueOnce(3) // approvedOrders
        .mockResolvedValueOnce(2) // receivedOrders
        .mockResolvedValueOnce(1); // cancelledOrders

      mockPrisma.purchaseOrder.aggregate.mockResolvedValueOnce({
        _sum: {
          totalAmount: '45000.00',
          balanceAmount: '40000.00',
        },
      });

      // 4 Purchase Invoices:
      // total: 4, pendingPayment: 3, paid: 1, partial: 0, cancelled: 0
      mockPrisma.purchaseInvoice.count
        .mockResolvedValueOnce(4) // totalInvoices
        .mockResolvedValueOnce(3) // pendingPaymentInvoices
        .mockResolvedValueOnce(1) // paidInvoices
        .mockResolvedValueOnce(0) // partialInvoices
        .mockResolvedValueOnce(0); // cancelledInvoices

      mockPrisma.purchaseInvoice.aggregate.mockResolvedValueOnce({
        _sum: {
          balanceAmount: '125000.00',
          totalAmount: '150000.00',
        },
      });

      const summary = await purchaseOrderRepository.getSummary(tenantId);

      // Verify PRD §17-18 PO fields derived from PurchaseOrder model
      expect(summary.total).toBe(6);
      expect(summary.pending).toBe(3);
      expect(summary.approved).toBe(3);
      expect(summary.received).toBe(2);
      expect(summary.cancelled).toBe(1);
      expect(summary.totalPurchaseOrders).toBe(6);
      expect(summary.pendingPurchaseOrders).toBe(3);
      expect(summary.approvedPurchaseOrders).toBe(3);
      expect(summary.receivedPurchaseOrders).toBe(2);
      expect(summary.cancelledPurchaseOrders).toBe(1);
      expect(summary.pendingValue).toBe(45000);

      // Verify detailed breakdowns
      expect(summary.orders).toEqual({
        total: 6,
        pending: 3,
        approved: 3,
        received: 2,
        cancelled: 1,
        pendingValue: 45000,
      });

      // Invoices must remain completely separate (AC-03, AC-15)
      expect(summary.invoices).toEqual({
        total: 4,
        pendingPayment: 3,
        paid: 1,
        partial: 0,
        cancelled: 0,
        pendingValue: 125000,
      });

      // Verify tenantId was passed in queries
      expect(mockPrisma.purchaseOrder.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId, deletedAt: null }),
        }),
      );
      expect(mockPrisma.purchaseInvoice.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId }),
        }),
      );
    });

    it('should demonstrate PO receiving decrements pending POs while invoices remain unaffected (PRD §52)', async () => {
      // After PO-003 transitions to RECEIVED:
      // total: 6, pending: 2, approved: 2, received: 3, cancelled: 1
      mockPrisma.purchaseOrder.count
        .mockResolvedValueOnce(6) // totalOrders
        .mockResolvedValueOnce(2) // pendingOrders (decremented from 3 to 2)
        .mockResolvedValueOnce(2) // approvedOrders
        .mockResolvedValueOnce(3) // receivedOrders (incremented from 2 to 3)
        .mockResolvedValueOnce(1); // cancelledOrders

      mockPrisma.purchaseOrder.aggregate.mockResolvedValueOnce({
        _sum: { totalAmount: '30000.00' },
      });

      // Invoices remain unaffected at 3 pending payments
      mockPrisma.purchaseInvoice.count
        .mockResolvedValueOnce(4)
        .mockResolvedValueOnce(3) // pendingPayment remains 3
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0);

      mockPrisma.purchaseInvoice.aggregate.mockResolvedValueOnce({
        _sum: { balanceAmount: '125000.00' },
      });

      const summary = await purchaseOrderRepository.getSummary(tenantId);

      expect(summary.pendingPurchaseOrders).toBe(2);
      expect(summary.invoices.pendingPayment).toBe(3);
    });

    it('should support branchId filtering for multi-branch environments', async () => {
      const branchId = 'branch-001';

      mockPrisma.purchaseOrder.count.mockResolvedValue(0);
      mockPrisma.purchaseOrder.aggregate.mockResolvedValue({ _sum: {} });
      mockPrisma.purchaseInvoice.count.mockResolvedValue(0);
      mockPrisma.purchaseInvoice.aggregate.mockResolvedValue({ _sum: {} });

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
      mockPrisma.purchaseOrder.count.mockResolvedValue(0);
      mockPrisma.purchaseOrder.aggregate.mockResolvedValue({ _sum: {} });
      mockPrisma.purchaseInvoice.count.mockResolvedValue(0);
      mockPrisma.purchaseInvoice.aggregate.mockResolvedValue({ _sum: {} });

      const result = await purchaseOrderService.getSummary(tenantId);
      expect(result).toBeDefined();
      expect(result.pendingPurchaseOrders).toBe(0);
    });
  });

  describe('Controller: getSummary', () => {
    it('should return 200 with summary data when successful', async () => {
      mockPrisma.purchaseOrder.count
        .mockResolvedValueOnce(20)
        .mockResolvedValueOnce(5)
        .mockResolvedValueOnce(5)
        .mockResolvedValueOnce(13)
        .mockResolvedValueOnce(2);
      mockPrisma.purchaseOrder.aggregate.mockResolvedValueOnce({ _sum: { totalAmount: 100000 } });
      mockPrisma.purchaseInvoice.count
        .mockResolvedValueOnce(15)
        .mockResolvedValueOnce(3)
        .mockResolvedValueOnce(10)
        .mockResolvedValueOnce(2)
        .mockResolvedValueOnce(0);
      mockPrisma.purchaseInvoice.aggregate.mockResolvedValueOnce({
        _sum: { balanceAmount: 50000 },
      });

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
          totalPurchaseOrders: 20,
          pendingPurchaseOrders: 5,
          approvedPurchaseOrders: 5,
          receivedPurchaseOrders: 13,
          cancelledPurchaseOrders: 2,
        }),
      });
    });

    it('should return 500 when database operation throws, rather than masking with 0', async () => {
      mockPrisma.purchaseOrder.count.mockRejectedValueOnce(new Error('DB Connection Lost'));

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
