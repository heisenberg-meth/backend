import { jest, describe, beforeEach, it, expect } from '@jest/globals';

jest.unstable_mockModule('../../../config/prisma.js', () => ({
  default: {
    invoice: {
      findMany: jest.fn(),
      aggregate: jest.fn(),
      count: jest.fn(),
      groupBy: jest.fn(),
    },
    invoiceItem: {
      findMany: jest.fn(),
    },
    invoiceAuditLog: {
      findMany: jest.fn(),
    },
    purchaseInvoice: {
      findMany: jest.fn(),
      aggregate: jest.fn(),
    },
    gstSummary: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      upsert: jest.fn(),
    },
    gstSetting: {
      findFirst: jest.fn(),
    },
    branch: {
      findMany: jest.fn(),
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

const gstCalculationService = (await import('../services/gst-calculation.service.js')).default;
const gstAggregationService = (await import('../services/gst-aggregation.service.js')).default;
const gstReconciliationService = (await import('../services/gst-reconciliation.service.js')).default;
const gstReportService = (await import('../services/gst-report.service.js')).default;
const gstExportService = (await import('../services/gst-export.service.js')).default;
const gstComplianceService = (await import('../services/gst-compliance.service.js')).default;
const gstAnalyticsService = (await import('../services/gst-analytics.service.js')).default;

function mockInvoice(overrides = {}) {
  return {
    id: 'inv-1',
    invoiceNumber: 'INV-001',
    tenantId: 'tenant-1',
    createdAt: new Date('2025-01-15'),
    subtotal: 1000,
    cgst: 90,
    sgst: 90,
    igst: 0,
    gstAmount: 180,
    totalAmount: 1180,
    status: 'COMPLETED',
    branchId: 'branch-1',
    deletedAt: null,
    items: [
      {
        id: 'item-1',
        unitPrice: 500,
        quantity: 2,
        gstPercentage: 18,
        cgst: 45,
        sgst: 45,
        igst: 0,
        totalPrice: 590,
        medicine: { hsnCode: '300490', name: 'Medicine A' },
        batch: { batchNumber: 'B001' },
      },
    ],
    branch: { id: 'branch-1', gstNumber: '29AAAAA0000A1Z5', name: 'Main Branch' },
    patient: { fullName: 'John Doe', gstNumber: '29BBBBB0000B1Z5' },
    ...overrides,
  };
}

describe('GstCalculationService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('splits CGST/SGST equally for intrastate', () => {
    const result = gstCalculationService.calculateGstBreakdown(1000, 18, false);
    expect(result.cgst).toBe(90);
    expect(result.sgst).toBe(90);
    expect(result.igst).toBe(0);
    expect(result.totalGst).toBe(180);
    expect(result.isInterstate).toBe(false);
  });

  it('assigns full GST to IGST for interstate', () => {
    const result = gstCalculationService.calculateGstBreakdown(1000, 18, true);
    expect(result.igst).toBe(180);
    expect(result.cgst).toBe(0);
    expect(result.sgst).toBe(0);
    expect(result.isInterstate).toBe(true);
  });

  it('handles 0% GST items', () => {
    const result = gstCalculationService.calculateGstBreakdown(500, 0, false);
    expect(result.totalGst).toBe(0);
    expect(result.cgst).toBe(0);
    expect(result.sgst).toBe(0);
  });

  it('handles fractional GST amounts correctly', () => {
    const result = gstCalculationService.calculateGstBreakdown(99.99, 12, false);
    expect(result.totalGst).toBeCloseTo(12, 0);
    expect(result.cgst + result.sgst).toBeCloseTo(12, 0);
  });

  it('determines tax type from GSTIN state codes', () => {
    expect(gstCalculationService.determineTaxType('29AAAAA', '29BBBBB')).toBe('INTRASTATE');
    expect(gstCalculationService.determineTaxType('29AAAAA', '27BBBBB')).toBe('INTERSTATE');
    expect(gstCalculationService.determineTaxType('', '29BBBBB')).toBe('INTRASTATE');
  });

  it('validates GST percentage rates', () => {
    expect(gstCalculationService.validateGstPercentage(18).valid).toBe(true);
    expect(gstCalculationService.validateGstPercentage(25).valid).toBe(false);
    expect(gstCalculationService.validateGstPercentage(0).valid).toBe(true);
    expect(gstCalculationService.validateGstPercentage(0.25).valid).toBe(true);
  });

  it('calculates invoice-level GST correctly for intrastate', () => {
    const items = [
      { unitPrice: 500, quantity: 2, gstPercentage: 18 },
      { unitPrice: 200, quantity: 1, gstPercentage: 12 },
    ];
    const result = gstCalculationService.calculateInvoiceGst(items, '29AAAAA', '29BBBBB');
    expect(result.isInterstate).toBe(false);
    expect(result.cgst).toBeCloseTo(102, 0);
    expect(result.sgst).toBeCloseTo(102, 0);
    expect(result.igst).toBe(0);
  });

  it('detects interstate from different GSTINs', () => {
    const items = [{ unitPrice: 1000, quantity: 1, gstPercentage: 18 }];
    const result = gstCalculationService.calculateInvoiceGst(items, '29AAAAA', '27BBBBB');
    expect(result.isInterstate).toBe(true);
    expect(result.igst).toBe(180);
    expect(result.cgst).toBe(0);
    expect(result.sgst).toBe(0);
  });
});

describe('GstReconciliationService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('reports match when stored and calculated GST agree', async () => {
    mockPrisma.invoice.findMany.mockResolvedValue([mockInvoice()]);
    mockPrisma.purchaseInvoice.findMany.mockResolvedValue([]);

    const result = await gstReconciliationService.reconcile('tenant-1');
    expect(result.mismatchCount).toBe(0);
    expect(result.totalChecked).toBe(1);
  });

  it('detects mismatch when stored and calculated GST differ', async () => {
    const inv = mockInvoice({ cgst: 999, sgst: 0, igst: 0, gstAmount: 999 });
    mockPrisma.invoice.findMany.mockResolvedValue([inv]);
    mockPrisma.purchaseInvoice.findMany.mockResolvedValue([]);

    const result = await gstReconciliationService.reconcile('tenant-1');
    expect(result.mismatchCount).toBe(1);
    expect(result.mismatches[0].invoiceNumber).toBe('INV-001');
    expect(result.mismatches[0].difference).not.toBe(0);
    expect(emitLocalEvent).toHaveBeenCalledWith(
      expect.stringMatching(/gst\.mismatch/),
      expect.objectContaining({ mismatchCount: 1 }),
    );
  });

  it('excludes cancelled invoices from reconciliation', async () => {
    mockPrisma.invoice.findMany.mockResolvedValue([]);
    mockPrisma.purchaseInvoice.findMany.mockResolvedValue([]);

    const result = await gstReconciliationService.reconcile('tenant-1');
    expect(result.totalChecked).toBe(0);

    expect(mockPrisma.invoice.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: { not: 'CANCELLED' },
          deletedAt: null,
        }),
      }),
    );
  });

  it('handles empty period with no invoices', async () => {
    mockPrisma.invoice.findMany.mockResolvedValue([]);
    mockPrisma.purchaseInvoice.findMany.mockResolvedValue([]);

    const result = await gstReconciliationService.reconcile('tenant-1');
    expect(result.totalChecked).toBe(0);
    expect(result.mismatchCount).toBe(0);
    expect(result.netGstLiability).toBe(0);
  });

  it('calculates net GST liability correctly', async () => {
    mockPrisma.invoice.findMany.mockResolvedValue([mockInvoice()]);
    mockPrisma.purchaseInvoice.findMany.mockResolvedValue([{ gstAmount: 50 }]);

    const result = await gstReconciliationService.reconcile('tenant-1');
    expect(result.totalOutputGst).toBe(180);
    expect(result.totalInputGst).toBe(50);
    expect(result.netGstLiability).toBe(130);
  });

  it('generates reconciliation CSV report', async () => {
    const inv = mockInvoice({ cgst: 999, sgst: 0, igst: 0 });
    mockPrisma.invoice.findMany.mockResolvedValue([inv]);
    mockPrisma.purchaseInvoice.findMany.mockResolvedValue([]);

    const report = await gstReconciliationService.generateReconciliationReport('tenant-1');
    expect(report.mismatchCount).toBe(1);
    expect(report.csvData).toContain('INV-001');
    expect(report.csvData).toContain('Invoice #');
  });
});

describe('GstAggregationService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('aggregates GST by date range', async () => {
    mockPrisma.invoice.findMany.mockResolvedValue([mockInvoice()]);
    mockPrisma.purchaseInvoice.findMany.mockResolvedValue([]);
    mockPrisma.gstSummary.findMany.mockResolvedValue([]);

    const result = await gstAggregationService.getGstSummary('tenant-1', {
      from: '2025-01-01',
      to: '2025-01-31',
    });

    expect(result.taxableAmount).toBeGreaterThan(0);
    expect(result.gstCollected).toBe(180);
    expect(result.period).toBeDefined();
  });

  it('handles date range with no invoices', async () => {
    mockPrisma.invoice.findMany.mockResolvedValue([]);
    mockPrisma.purchaseInvoice.findMany.mockResolvedValue([]);
    mockPrisma.gstSummary.findMany.mockResolvedValue([]);

    const result = await gstAggregationService.getGstSummary('tenant-1', {
      from: '2020-01-01',
      to: '2020-01-31',
    });

    expect(result.taxableAmount).toBe(0);
    expect(result.gstCollected).toBe(0);
  });

  it('aggregates monthly summaries by period filter', async () => {
    mockPrisma.invoice.findMany.mockResolvedValue([]);
    mockPrisma.purchaseInvoice.findMany.mockResolvedValue([]);
    mockPrisma.gstSummary.findMany.mockResolvedValue([{
      reportMonth: '2025-01',
      outputTax: 5000,
      inputTaxCredit: 2000,
      netGstPayable: 3000,
    }]);

    const result = await gstAggregationService.getGstSummary('tenant-1', { period: 'MONTHLY' });
    expect(result.summaries).toHaveLength(1);
    expect(result.summaries[0].netGstPayable).toBe(3000);
  });

  it('generates monthly summary with upsert', async () => {
    mockPrisma.invoice.findMany.mockResolvedValue([mockInvoice()]);
    mockPrisma.purchaseInvoice.findMany.mockResolvedValue([{ gstAmount: 50 }]);
    mockPrisma.gstSummary.upsert.mockResolvedValue({
      id: 'summary-1',
      tenantId: 'tenant-1',
      reportMonth: new Date('2025-01-01'),
      outputTax: 180,
      inputTaxCredit: 50,
      netGstPayable: 130,
    });

    const result = await gstAggregationService.generateMonthlySummary('tenant-1', '2025-01-15');
    expect(result.netGstPayable).toBe(130);
    expect(mockPrisma.gstSummary.upsert).toHaveBeenCalledTimes(1);
  });

  it('handles branch-specific summary', async () => {
    mockPrisma.invoice.findMany.mockResolvedValue([mockInvoice()]);

    const result = await gstAggregationService.getBranchGstSummary(
      'tenant-1', 'branch-1', '2025-01-01', '2025-01-31'
    );
    expect(result.branchId).toBe('branch-1');
    expect(result.invoiceCount).toBe(1);
  });
});

describe('GstComplianceService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns compliant when summary exists', async () => {
    mockPrisma.invoice.count.mockResolvedValue(10);
    mockPrisma.gstSummary.findUnique.mockResolvedValue({ id: 's1', updatedAt: new Date() });

    const result = await gstComplianceService.checkReturnFilingCompliance('tenant-1');
    expect(result.overallStatus).toBe('COMPLIANT');
    expect(result.overduePeriods).toBe(0);
  });

  it('returns overdue when past due without summary', async () => {
    mockPrisma.invoice.count.mockResolvedValue(5);
    mockPrisma.gstSummary.findUnique.mockResolvedValue(null);

    const result = await gstComplianceService.checkReturnFilingCompliance('tenant-1');
    expect(result.overallStatus).toBe('NON_COMPLIANT');
    expect(result.overduePeriods).toBeGreaterThanOrEqual(1);
  });

  it('handles tenant with no invoices', async () => {
    mockPrisma.invoice.count.mockResolvedValue(0);
    mockPrisma.gstSummary.findUnique.mockResolvedValue(null);

    const result = await gstComplianceService.checkReturnFilingCompliance('tenant-1');
    expect(result.compliance).toBeDefined();
    expect(result.compliance.length).toBe(6);
  });

  it('returns compliance overview with settings', async () => {
    mockPrisma.gstSetting.findFirst.mockResolvedValue({ id: 'gs1', tenantId: 'tenant-1' });
    mockPrisma.invoice.aggregate.mockResolvedValue({ _count: 50, _sum: { gstAmount: 9000 } });
    mockPrisma.invoice.count.mockResolvedValue(10);
    mockPrisma.gstSummary.findUnique.mockResolvedValue({ id: 's1', updatedAt: new Date() });

    const overview = await gstComplianceService.getComplianceOverview('tenant-1');
    expect(overview.settingsConfigured).toBe(true);
    expect(overview.currentYearInvoices).toBe(50);
  });
});

describe('GstAnalyticsService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns GST trends for N months', async () => {
    mockPrisma.invoice.aggregate.mockResolvedValue({
      _sum: { gstAmount: 180, cgst: 90, sgst: 90, igst: 0 },
      _count: 1,
    });

    const result = await gstAnalyticsService.getGstTrends('tenant-1', 3);
    expect(result.labels).toHaveLength(3);
    expect(result.data).toHaveLength(3);
    expect(result.data[0].totalGst).toBe(180);
  });

  it('returns zeroed metrics when no data exists', async () => {
    mockPrisma.invoice.aggregate.mockResolvedValue({
      _sum: { gstAmount: null, cgst: null, sgst: null, igst: null },
      _count: 0,
    });

    const result = await gstAnalyticsService.getGstTrends('tenant-1', 1);
    expect(result.data[0].totalGst).toBe(0);
    expect(result.data[0].invoiceCount).toBe(0);
  });

  it('returns GST by branch', async () => {
    mockPrisma.invoice.groupBy.mockResolvedValue([
      { branchId: 'branch-1', _sum: { gstAmount: 180, cgst: 90, sgst: 90, igst: 0 }, _count: 1 },
    ]);
    mockPrisma.branch.findMany.mockResolvedValue([{ id: 'branch-1', name: 'Main Branch' }]);

    const result = await gstAnalyticsService.getGstByBranch('tenant-1');
    expect(result).toHaveLength(1);
    expect(result[0].branchName).toBe('Main Branch');
  });

  it('calculates ITC utilization percent', async () => {
    mockPrisma.invoice.aggregate.mockResolvedValue({
      _sum: { gstAmount: 1000, cgst: 500, sgst: 500, igst: 0 },
    });
    mockPrisma.purchaseInvoice.aggregate.mockResolvedValue({
      _sum: { gstAmount: 300 },
    });

    const result = await gstAnalyticsService.getInputTaxCreditSummary('tenant-1');
    expect(result.outputGst).toBe(1000);
    expect(result.inputGst).toBe(300);
    expect(result.netLiability).toBe(700);
    expect(result.itcUtilizationPercent).toBe(30);
  });
});

describe('GstExportService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('generates JSON export format', async () => {
    mockPrisma.invoice.findMany.mockResolvedValue([mockInvoice()]);

    const result = await gstExportService.exportGstFiling('tenant-1', {
      month: 1, year: 2025, format: 'json',
    });

    expect(result.data).toHaveLength(1);
    expect(result.data[0].invoiceNumber).toBe('INV-001');
    expect(result.data[0].items).toHaveLength(1);
  });

  it('generates CSV export format', async () => {
    mockPrisma.invoice.findMany.mockResolvedValue([mockInvoice()]);

    const result = await gstExportService.exportGstFiling('tenant-1', {
      month: 1, year: 2025, format: 'csv',
    });

    expect(result.buffer).toBeInstanceOf(Buffer);
    expect(result.contentType).toBe('text/csv');
    expect(result.filename).toContain('gst-filing');
  });

  it('handles empty period with no invoices', async () => {
    mockPrisma.invoice.findMany.mockResolvedValue([]);

    const result = await gstExportService.exportGstFiling('tenant-1', {
      month: 1, year: 2025, format: 'json',
    });

    expect(result.data).toHaveLength(0);
  });

  it('excludes cancelled invoices', async () => {
    mockPrisma.invoice.findMany.mockResolvedValue([
      mockInvoice({ status: 'CANCELLED' }),
    ]);

    await gstExportService.exportGstFiling('tenant-1', {
      month: 1,
      year: 2025,
      format: 'json',
    });

    expect(mockPrisma.invoice.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: { not: 'CANCELLED' },
        }),
      }),
    );
  });

  it('handles walk-in customers without patient data', async () => {
    mockPrisma.invoice.findMany.mockResolvedValue([mockInvoice({ patient: null })]);

    const result = await gstExportService.exportGstFiling('tenant-1', {
      month: 1, year: 2025, format: 'json',
    });

    expect(result.data[0].customerName).toBe('Walk-in');
  });
});

describe('GstReportService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('generates JSON report format', async () => {
    mockPrisma.invoice.findMany.mockResolvedValue([mockInvoice()]);
    mockPrisma.invoiceItem.findMany.mockResolvedValue([]);
    mockPrisma.purchaseInvoice.findMany.mockResolvedValue([]);

    const result = await gstReportService.generateReport('tenant-1', {
      month: 1, year: 2025, format: 'json',
    });

    expect(result.reportData).toBeDefined();
    expect(result.reportData.summary).toBeDefined();
  });
});
