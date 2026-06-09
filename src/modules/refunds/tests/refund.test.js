import { jest, describe, beforeEach, it, expect } from '@jest/globals';

jest.unstable_mockModule('../../../config/prisma.js', () => ({
  default: {
    return: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      aggregate: jest.fn(),
      groupBy: jest.fn(),
    },
    returnItem: {
      createMany: jest.fn(),
      update: jest.fn(),
    },
    refundPayment: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
    invoice: {
      findUnique: jest.fn(),
      update: jest.fn(),
      aggregate: jest.fn(),
    },
    inventoryBatch: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    stockMovement: {
      create: jest.fn(),
    },
    creditNote: {
      create: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
    invoiceAuditLog: {
      create: jest.fn(),
    },
  },
}));

jest.unstable_mockModule('../../../shared/utils/logger.js', () => ({
  default: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

jest.unstable_mockModule('../../../shared/events/local-event-bus.js', () => ({
  emitLocalEvent: jest.fn(),
}));

const mockPrisma = (await import('../../../config/prisma.js')).default;
const emitLocalEvent = (await import('../../../shared/events/local-event-bus.js')).emitLocalEvent;

const refundCalculation = (await import('../services/refund-calculation.service.js')).default;
const refundEligibility = (await import('../services/refund-eligibility.service.js')).default;
const refundFraud = (await import('../services/refund-fraud.service.js')).default;
const refundApproval = (await import('../services/refund-approval.service.js')).default;

function mockInvoiceItem(overrides = {}) {
  return {
    id: 'item-1',
    medicineId: 'med-1',
    batchId: 'batch-1',
    quantity: 5,
    unitPrice: 100,
    gstPercentage: 18,
    cgst: 90,
    sgst: 90,
    igst: 0,
    totalPrice: 590,
    medicine: {
      name: 'Paracetamol 650',
      hsnCode: '300490',
      scheduleType: 'OTC',
      storageCondition: 'ROOM_TEMPERATURE',
    },
    batch: { batchNumber: 'B001' },
    ...overrides,
  };
}

function mockReturn(overrides = {}) {
  return {
    id: 'return-1',
    returnNumber: 'REF-2026-0001',
    tenantId: 'tenant-1',
    invoiceId: 'inv-1',
    patientId: 'pat-1',
    returnReason: 'PATIENT_RETURN',
    status: 'APPROVED',
    totalReturnAmount: 590,
    totalGstAdjustment: 90,
    approvalRequired: false,
    fraudScore: 0,
    fraudFlags: [],
    invoice: { invoiceNumber: 'INV-2026-001' },
    patient: { fullName: 'John Doe' },
    items: [mockInvoiceItem()],
    refundPayments: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('RefundCalculationService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('calculates refund amount for an item with CGST/SGST', () => {
    const item = mockInvoiceItem();
    const result = refundCalculation.calculateRefundAmount(item, 2);
    expect(result.subtotal).toBe(200);
    expect(result.cgst).toBe(18);
    expect(result.sgst).toBe(18);
    expect(result.igst).toBe(0);
    expect(result.gstAmount).toBe(36);
    expect(result.totalRefund).toBe(236);
  });

  it('calculates refund amount with IGST for interstate', () => {
    const item = mockInvoiceItem({ igst: 180, cgst: 0, sgst: 0, gstPercentage: 18 });
    const result = refundCalculation.calculateRefundAmount(item, 1);
    expect(result.igst).toBe(18);
    expect(result.cgst).toBe(0);
    expect(result.sgst).toBe(0);
  });

  it('handles 0% GST items', () => {
    const item = mockInvoiceItem({ gstPercentage: 0, cgst: 0, sgst: 0, igst: 0 });
    const result = refundCalculation.calculateRefundAmount(item, 3);
    expect(result.gstAmount).toBe(0);
    expect(result.totalRefund).toBe(300);
  });

  it('calculates total refund across multiple items', () => {
    const items = [
      refundCalculation.calculateRefundAmount(mockInvoiceItem({ unitPrice: 100 }), 2),
      refundCalculation.calculateRefundAmount(
        mockInvoiceItem({ unitPrice: 50, gstPercentage: 12 }),
        1,
      ),
    ];
    const total = refundCalculation.calculateTotalRefund(items);
    expect(total.subtotal).toBeCloseTo(250);
    expect(total.totalRefund).toBeGreaterThan(total.subtotal);
  });
});

describe('RefundEligibilityService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('validates invoice exists', () => {
    expect(refundEligibility.validateInvoice(null).eligible).toBe(false);
    expect(
      refundEligibility.validateInvoice({ deletedAt: null, status: 'COMPLETED' }).eligible,
    ).toBe(true);
  });

  it('rejects cancelled invoices', () => {
    expect(
      refundEligibility.validateInvoice({ deletedAt: null, status: 'CANCELLED' }).eligible,
    ).toBe(false);
  });

  it('rejects deleted invoices', () => {
    expect(
      refundEligibility.validateInvoice({ deletedAt: new Date(), status: 'COMPLETED' }).eligible,
    ).toBe(false);
  });

  it('rejects refunds beyond 30 day window', () => {
    const old = { createdAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000) };
    expect(refundEligibility.validateReturnWindow(old).eligible).toBe(false);
  });

  it('allows refund within 30 day window', () => {
    const recent = { createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000) };
    expect(refundEligibility.validateReturnWindow(recent).eligible).toBe(true);
  });

  it('prevents refund quantity exceeding sold quantity', () => {
    const item = mockInvoiceItem();
    expect(refundEligibility.validateRefundQuantity(item, 10).valid).toBe(false);
    expect(refundEligibility.validateRefundQuantity(item, 5).valid).toBe(true);
    expect(refundEligibility.validateRefundQuantity(item, 0).valid).toBe(false);
  });

  it('denies return for cold-chain items', () => {
    const coldChainItem = {
      ...mockInvoiceItem(),
      medicine: { ...mockInvoiceItem().medicine, storageCondition: 'COLD_STORAGE' },
    };
    expect(refundEligibility.validateItemEligibility(coldChainItem).eligible).toBe(false);
  });

  it('allows return with approval for controlled substances', () => {
    const controlled = {
      ...mockInvoiceItem(),
      medicine: { ...mockInvoiceItem().medicine, scheduleType: 'X' },
    };
    const result = refundEligibility.validateItemEligibility(controlled);
    expect(result.eligible).toBe(true);
    expect(result.requiresApproval).toBe(true);
  });

  it('handles already returned items', () => {
    const returned = { ...mockInvoiceItem(), returnedQuantity: 3 };
    expect(refundEligibility.validateItemEligibility(returned).eligible).toBe(false);
  });

  it('returns eligibility matrix for all medicine types', () => {
    const matrix = refundEligibility.getEligibilityMatrix();
    expect(matrix).toHaveLength(9);
    const coldChain = matrix.find((m) => m.medicineType === 'cold-chain');
    expect(coldChain.refundAllowed).toBe(false);
  });

  it('detects duplicate refunds', () => {
    const existing = [{ items: [{ invoiceItemId: 'item-1' }] }];
    expect(refundEligibility.checkDuplicateRefund(existing, 'item-1').duplicate).toBe(true);
    expect(refundEligibility.checkDuplicateRefund(existing, 'item-2').duplicate).toBe(false);
  });

  it('requires approval for high-value refunds', async () => {
    const result = await refundEligibility.determineApprovalRequired(
      [{ requiresApproval: false }],
      50000,
    );
    expect(result.requiresApproval).toBe(true);
  });
});

describe('RefundFraudService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('flags repeated refunds from same patient', () => {
    const existing = Array(5)
      .fill(null)
      .map((_, i) => ({ items: [{ invoiceItemId: `item-${i}` }] }));
    const result = refundFraud.checkRepeatedRefunds(existing);
    expect(result.flag).toContain('Repeated');
    expect(result.score).toBeGreaterThan(0);
  });

  it('flags duplicate item refund attempts', () => {
    const existing = [{ items: [{ invoiceItemId: 'item-1' }] }];
    const result = refundFraud.checkDuplicateItems([{ invoiceItemId: 'item-1' }], existing);
    expect(result.score).toBeGreaterThan(0);
  });

  it('flags high-value refunds', () => {
    const result = refundFraud.checkHighValue(25000);
    expect(result.flag).toContain('High-value');
  });

  it('evaluates overall fraud score', async () => {
    const result = await refundFraud.evaluateRefund(
      't1',
      'p1',
      [{ invoiceItemId: 'i1', medicine: { scheduleType: 'X' } }],
      25000,
      [],
    );
    expect(result.fraudScore).toBeGreaterThan(0);
    expect(result.fraudFlags.length).toBeGreaterThan(0);
    expect(result.requiresReview).toBeDefined();
    expect(result.isBlocked).toBeDefined();
  });

  it('returns low fraud score for normal refunds', async () => {
    const result = await refundFraud.evaluateRefund(
      't1',
      'p1',
      [{ invoiceItemId: 'i1', medicine: { scheduleType: 'OTC' } }],
      500,
      [],
    );
    expect(result.fraudScore).toBe(0);
    expect(result.fraudFlags).toHaveLength(0);
  });
});

describe('RefundApprovalService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('approves a refund that is in UNDER_REVIEW status', async () => {
    mockPrisma.return.findUnique.mockResolvedValue(mockReturn({ status: 'UNDER_REVIEW' }));
    mockPrisma.return.update.mockResolvedValue(
      mockReturn({ status: 'APPROVED', approvedBy: 'user-1', approvedAt: new Date() }),
    );

    const result = await refundApproval.approveRefund('return-1', 'user-1');
    expect(result.status).toBe('APPROVED');
    expect(emitLocalEvent).toHaveBeenCalled();
  });

  it('rejects a refund that is in REQUESTED status', async () => {
    mockPrisma.return.findUnique.mockResolvedValue(mockReturn({ status: 'REQUESTED' }));
    mockPrisma.return.update.mockResolvedValue(
      mockReturn({ status: 'REJECTED', rejectionReason: 'Test reject' }),
    );

    const result = await refundApproval.rejectRefund('return-1', 'user-1', 'Test reject');
    expect(result.status).toBe('REJECTED');
    expect(emitLocalEvent).toHaveBeenCalled();
  });

  it('throws if refund not found for approval', async () => {
    mockPrisma.return.findUnique.mockResolvedValue(null);
    await expect(refundApproval.approveRefund('nonexistent', 'user-1')).rejects.toThrow(
      'not found',
    );
  });

  it('throws if refund in wrong status for approval', async () => {
    mockPrisma.return.findUnique.mockResolvedValue(mockReturn({ status: 'REFUNDED' }));
    await expect(refundApproval.approveRefund('return-1', 'user-1')).rejects.toThrow(
      'cannot approve',
    );
  });
});
