import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockPrisma = {
  purchaseOrder: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
    aggregate: jest.fn(),
  },
  inventoryBatch: {
    findFirst: jest.fn(),
  },
  purchaseInvoice: {
    count: jest.fn(),
    aggregate: jest.fn(),
  },
  auditLog: {
    create: jest.fn(),
  },
};

jest.unstable_mockModule('../../src/config/prisma.js', () => ({ default: mockPrisma }));
jest.unstable_mockModule('../../src/shared/events/local-event-bus.js', () => ({
  emitLocalEvent: jest.fn(),
}));
jest.unstable_mockModule('../../src/shared/events/erp-event-bus.js', () => ({
  emitEvent: jest.fn(),
}));
jest.unstable_mockModule(
  '../../src/modules/inventory/service/cache-invalidator.service.js',
  () => ({
    default: {
      invalidateInventoryCaches: jest.fn(),
    },
  }),
);
jest.unstable_mockModule('../../src/shared/utils/logger.js', () => ({
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const { default: purchaseOrderService } =
  await import('../../src/modules/purchase-orders/service/purchase-order.service.js');
const { default: purchaseOrderController } =
  await import('../../src/modules/purchase-orders/controller/purchase-order.fastify.controller.js');
const { default: purchaseOrderRepository } =
  await import('../../src/modules/purchase-orders/repository/purchase-order.prisma.repository.js');

describe('Purchase Order Cancellation (PRD Specification)', () => {
  const tenantId = 'tenant-xyz';
  const userId = 'user-123';
  const poId = 'po-4853';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Service: cancelOrder', () => {
    it('should cancel a PENDING / PENDING_APPROVAL purchase order successfully', async () => {
      const existingPo = {
        id: poId,
        tenantId,
        orderNumber: 'PO-20260904-4853',
        status: 'PENDING_APPROVAL',
        notes: 'Urgent order',
        items: [{ medicineId: 'med-1' }],
      };

      mockPrisma.purchaseOrder.findFirst.mockResolvedValue(existingPo);
      mockPrisma.purchaseOrder.update.mockResolvedValue({
        ...existingPo,
        status: 'CANCELLED',
        cancelledAt: new Date(),
        notes: 'Urgent order\nCancellation Reason: Cancelled by user',
      });

      const result = await purchaseOrderService.cancelOrder(
        tenantId,
        poId,
        userId,
        'Cancelled by user',
      );

      expect(result.status).toBe('CANCELLED');
      expect(mockPrisma.purchaseOrder.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: poId, tenantId },
          data: expect.objectContaining({
            status: 'CANCELLED',
            notes: expect.stringContaining('Cancellation Reason: Cancelled by user'),
          }),
        }),
      );
    });

    it('should cancel an APPROVED purchase order successfully', async () => {
      const existingPo = {
        id: poId,
        tenantId,
        orderNumber: 'PO-20260904-4853',
        status: 'APPROVED',
        notes: 'Approved by manager',
        items: [{ medicineId: 'med-1' }, { medicineId: 'med-2' }],
      };

      mockPrisma.purchaseOrder.findFirst.mockResolvedValue(existingPo);
      mockPrisma.purchaseOrder.update.mockResolvedValue({
        ...existingPo,
        status: 'CANCELLED',
        cancelledAt: new Date(),
      });

      const result = await purchaseOrderService.cancelOrder(
        tenantId,
        poId,
        userId,
        'Supplier out of stock',
      );

      expect(result.status).toBe('CANCELLED');
    });

    it('should cancel an order in PENDING status (alias) successfully', async () => {
      const existingPo = {
        id: poId,
        tenantId,
        orderNumber: 'PO-20260904-4853',
        status: 'PENDING',
        notes: '',
        items: [],
      };

      mockPrisma.purchaseOrder.findFirst.mockResolvedValue(existingPo);
      mockPrisma.purchaseOrder.update.mockResolvedValue({
        ...existingPo,
        status: 'CANCELLED',
      });

      const result = await purchaseOrderService.cancelOrder(tenantId, poId, userId);
      expect(result.status).toBe('CANCELLED');
    });

    it('should reject cancellation of a RECEIVED order with 409 INVALID_STATUS_TRANSITION', async () => {
      const existingPo = {
        id: poId,
        tenantId,
        orderNumber: 'PO-20260904-4853',
        status: 'RECEIVED',
        items: [],
      };

      mockPrisma.purchaseOrder.findFirst.mockResolvedValue(existingPo);

      await expect(
        purchaseOrderService.cancelOrder(tenantId, poId, userId, 'Late cancellation'),
      ).rejects.toMatchObject({
        statusCode: 409,
        code: 'INVALID_STATUS_TRANSITION',
        message: 'A received purchase order cannot be cancelled.',
      });

      expect(mockPrisma.purchaseOrder.update).not.toHaveBeenCalled();
    });

    it('should reject cancellation of a PARTIALLY_RECEIVED order with 409 Conflict', async () => {
      const existingPo = {
        id: poId,
        tenantId,
        orderNumber: 'PO-20260904-4853',
        status: 'PARTIALLY_RECEIVED',
        items: [],
      };

      mockPrisma.purchaseOrder.findFirst.mockResolvedValue(existingPo);

      await expect(purchaseOrderService.cancelOrder(tenantId, poId, userId)).rejects.toMatchObject({
        statusCode: 409,
        code: 'INVALID_STATUS_TRANSITION',
        message: 'A received purchase order cannot be cancelled.',
      });
    });

    it('should reject cancellation of an already CANCELLED order with 409 Conflict', async () => {
      const existingPo = {
        id: poId,
        tenantId,
        orderNumber: 'PO-20260904-4853',
        status: 'CANCELLED',
        items: [],
      };

      mockPrisma.purchaseOrder.findFirst.mockResolvedValue(existingPo);

      await expect(purchaseOrderService.cancelOrder(tenantId, poId, userId)).rejects.toMatchObject({
        statusCode: 409,
        code: 'INVALID_STATUS_TRANSITION',
        message: 'A cancelled purchase order cannot be cancelled again.',
      });

      expect(mockPrisma.purchaseOrder.update).not.toHaveBeenCalled();
    });

    it('should throw 404 when purchase order is not found', async () => {
      mockPrisma.purchaseOrder.findFirst.mockResolvedValue(null);

      await expect(
        purchaseOrderService.cancelOrder(tenantId, 'non-existent', userId),
      ).rejects.toThrow();
    });
  });

  describe('Controller: cancelOrder', () => {
    it('should return 200 with PRD-compliant response payload on successful cancellation', async () => {
      const existingPo = {
        id: poId,
        tenantId,
        orderNumber: 'PO-20260904-4853',
        status: 'PENDING_APPROVAL',
        notes: '',
        items: [],
      };

      mockPrisma.purchaseOrder.findFirst.mockResolvedValue(existingPo);
      mockPrisma.purchaseOrder.update.mockResolvedValue({
        ...existingPo,
        status: 'CANCELLED',
      });

      const req = {
        params: { id: poId },
        body: { reason: 'Cancelled by user' },
        tenantId,
        user: { id: userId },
      };

      const reply = {
        send: jest.fn(),
        code: jest.fn().mockReturnThis(),
      };

      await purchaseOrderController.cancelOrder(req, reply);

      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          purchaseOrder: {
            id: poId,
            poNumber: 'PO-20260904-4853',
            status: 'CANCELLED',
          },
          message: 'Purchase order cancelled',
        }),
      );
    });

    it('should return 409 Conflict when cancelling a received purchase order', async () => {
      const existingPo = {
        id: poId,
        tenantId,
        orderNumber: 'PO-20260904-4853',
        status: 'RECEIVED',
        items: [],
      };

      mockPrisma.purchaseOrder.findFirst.mockResolvedValue(existingPo);

      const req = {
        params: { id: poId },
        body: { reason: 'Cancelled by user' },
        tenantId,
        user: { id: userId },
      };

      const reply = {
        send: jest.fn(),
        code: jest.fn().mockReturnThis(),
      };

      await purchaseOrderController.cancelOrder(req, reply);

      expect(reply.code).toHaveBeenCalledWith(409);
      expect(reply.send).toHaveBeenCalledWith({
        success: false,
        code: 'INVALID_STATUS_TRANSITION',
        message: 'A received purchase order cannot be cancelled.',
      });
    });
  });

  describe('Repository: Summary update on cancellation (PRD §7)', () => {
    it('should reflect decremented pending count and incremented cancelled count in summary', async () => {
      // 3 pending initially -> 1 cancelled -> 2 pending, 1 cancelled
      mockPrisma.purchaseOrder.count
        .mockResolvedValueOnce(5) // total
        .mockResolvedValueOnce(2) // pendingOrders (decreased by 1)
        .mockResolvedValueOnce(1) // approved
        .mockResolvedValueOnce(1) // received
        .mockResolvedValueOnce(1); // cancelledOrders (increased by 1)

      mockPrisma.purchaseOrder.aggregate.mockResolvedValueOnce({
        _sum: { totalAmount: '20000.00', balanceAmount: '20000.00' },
      });

      mockPrisma.purchaseInvoice.count
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0);

      mockPrisma.purchaseInvoice.aggregate.mockResolvedValueOnce({
        _sum: { balanceAmount: '0', totalAmount: '0' },
      });

      const summary = await purchaseOrderRepository.getSummary(tenantId);

      expect(summary.pendingPurchaseOrders).toBe(2);
      expect(summary.cancelledPurchaseOrders).toBe(1);
    });
  });
});
