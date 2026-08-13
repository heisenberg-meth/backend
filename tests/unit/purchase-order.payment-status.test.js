import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockPrisma = {
  purchaseInvoice: {
    findFirst: jest.fn(),
    update: jest.fn(),
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

const { default: purchaseOrderService } =
  await import('../../src/modules/purchase-orders/service/purchase-order.service.js');

describe('PurchaseOrderService.updatePaymentStatus', () => {
  const tenantId = 'tenant-1';
  const invoiceId = 'inv-123';
  const userId = 'user-1';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should throw NotFoundError if invoice does not exist', async () => {
    mockPrisma.purchaseInvoice.findFirst.mockResolvedValue(null);

    await expect(
      purchaseOrderService.updatePaymentStatus(
        tenantId,
        invoiceId,
        { paymentStatus: 'PAID' },
        userId,
      ),
    ).rejects.toThrow('Purchase invoice not found');
  });

  it('should throw BadRequestError for invalid payment status', async () => {
    mockPrisma.purchaseInvoice.findFirst.mockResolvedValue({
      id: invoiceId,
      tenantId,
      paymentStatus: 'PENDING',
      totalAmount: 1000,
    });

    await expect(
      purchaseOrderService.updatePaymentStatus(
        tenantId,
        invoiceId,
        { paymentStatus: 'INVALID_STATUS' },
        userId,
      ),
    ).rejects.toThrow('Invalid payment status: INVALID_STATUS');
  });

  it('should successfully transition from PENDING to PAID and set full paid amount', async () => {
    mockPrisma.purchaseInvoice.findFirst.mockResolvedValue({
      id: invoiceId,
      tenantId,
      paymentStatus: 'PENDING',
      totalAmount: 1500,
      paidAmount: 0,
      balanceAmount: 1500,
      paidAt: null,
    });

    mockPrisma.purchaseInvoice.update.mockResolvedValue({
      id: invoiceId,
      paymentStatus: 'PAID',
      paidAmount: 1500,
      balanceAmount: 0,
    });

    const result = await purchaseOrderService.updatePaymentStatus(
      tenantId,
      invoiceId,
      { paymentStatus: 'PAID' },
      userId,
    );

    expect(mockPrisma.purchaseInvoice.update).toHaveBeenCalledWith({
      where: { id: invoiceId },
      data: expect.objectContaining({
        paymentStatus: 'PAID',
        paidAmount: 1500,
        balanceAmount: 0,
        paidAt: expect.any(Date),
      }),
    });

    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
      data: {
        tenantId,
        userId,
        action: 'PAYMENT_STATUS_UPDATED',
        target: `PurchaseInvoice:${invoiceId}`,
        type: 'PAYMENT',
      },
    });

    expect(result.paymentStatus).toBe('PAID');
  });

  it('should successfully transition from PENDING to PARTIAL with specified paid amount', async () => {
    mockPrisma.purchaseInvoice.findFirst.mockResolvedValue({
      id: invoiceId,
      tenantId,
      paymentStatus: 'PENDING',
      totalAmount: 2000,
      paidAmount: 0,
      balanceAmount: 2000,
      paidAt: null,
    });

    mockPrisma.purchaseInvoice.update.mockResolvedValue({
      id: invoiceId,
      paymentStatus: 'PARTIAL',
      paidAmount: 800,
      balanceAmount: 1200,
    });

    const result = await purchaseOrderService.updatePaymentStatus(
      tenantId,
      invoiceId,
      { paymentStatus: 'PARTIAL', paidAmount: 800 },
      userId,
    );

    expect(mockPrisma.purchaseInvoice.update).toHaveBeenCalledWith({
      where: { id: invoiceId },
      data: expect.objectContaining({
        paymentStatus: 'PARTIAL',
        paidAmount: 800,
        balanceAmount: 1200,
        paidAt: expect.any(Date),
      }),
    });

    expect(result.paymentStatus).toBe('PARTIAL');
  });

  it('should successfully transition from PARTIAL to PAID', async () => {
    mockPrisma.purchaseInvoice.findFirst.mockResolvedValue({
      id: invoiceId,
      tenantId,
      paymentStatus: 'PARTIAL',
      totalAmount: 2000,
      paidAmount: 800,
      balanceAmount: 1200,
      paidAt: new Date('2026-01-01'),
    });

    mockPrisma.purchaseInvoice.update.mockResolvedValue({
      id: invoiceId,
      paymentStatus: 'PAID',
      paidAmount: 2000,
      balanceAmount: 0,
    });

    const result = await purchaseOrderService.updatePaymentStatus(
      tenantId,
      invoiceId,
      { paymentStatus: 'PAID' },
      userId,
    );

    expect(mockPrisma.purchaseInvoice.update).toHaveBeenCalledWith({
      where: { id: invoiceId },
      data: expect.objectContaining({
        paymentStatus: 'PAID',
        paidAmount: 2000,
        balanceAmount: 0,
        paidAt: expect.any(Date),
      }),
    });

    expect(result.paymentStatus).toBe('PAID');
  });

  it('should REJECT transition from PAID to PENDING (PAID is terminal & immutable)', async () => {
    mockPrisma.purchaseInvoice.findFirst.mockResolvedValue({
      id: invoiceId,
      tenantId,
      paymentStatus: 'PAID',
      totalAmount: 2000,
      paidAmount: 2000,
      balanceAmount: 0,
      paidAt: new Date('2026-01-01'),
    });

    await expect(
      purchaseOrderService.updatePaymentStatus(
        tenantId,
        invoiceId,
        { paymentStatus: 'PENDING' },
        userId,
      ),
    ).rejects.toThrow(
      'Paid invoices are immutable and cannot be transitioned back to PENDING or PARTIAL',
    );

    expect(mockPrisma.purchaseInvoice.update).not.toHaveBeenCalled();
  });

  it('should REJECT transition from PAID to PARTIAL (PAID is terminal & immutable)', async () => {
    mockPrisma.purchaseInvoice.findFirst.mockResolvedValue({
      id: invoiceId,
      tenantId,
      paymentStatus: 'PAID',
      totalAmount: 2000,
      paidAmount: 2000,
      balanceAmount: 0,
      paidAt: new Date('2026-01-01'),
    });

    await expect(
      purchaseOrderService.updatePaymentStatus(
        tenantId,
        invoiceId,
        { paymentStatus: 'PARTIAL', paidAmount: 500 },
        userId,
      ),
    ).rejects.toThrow(
      'Paid invoices are immutable and cannot be transitioned back to PENDING or PARTIAL',
    );

    expect(mockPrisma.purchaseInvoice.update).not.toHaveBeenCalled();
  });

  it('should REJECT transition from PARTIAL back to PENDING', async () => {
    mockPrisma.purchaseInvoice.findFirst.mockResolvedValue({
      id: invoiceId,
      tenantId,
      paymentStatus: 'PARTIAL',
      totalAmount: 2000,
      paidAmount: 1000,
      balanceAmount: 1000,
      paidAt: new Date('2026-01-01'),
    });

    await expect(
      purchaseOrderService.updatePaymentStatus(
        tenantId,
        invoiceId,
        { paymentStatus: 'PENDING' },
        userId,
      ),
    ).rejects.toThrow('Invalid payment status transition: PARTIAL → PENDING');

    expect(mockPrisma.purchaseInvoice.update).not.toHaveBeenCalled();
  });
});
