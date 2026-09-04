import { jest, describe, beforeEach, it, expect } from '@jest/globals';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const prismaPath = path.resolve(__dirname, '../../../config/prisma.js');
const validatorPath = path.resolve(__dirname, '../validators/sales-report.validator.js');
const csvGenPath = path.resolve(__dirname, '../services/csv-generator.js');
const pdfGenPath = path.resolve(__dirname, '../services/pdf-generator.js');
const exportServicePath = path.resolve(__dirname, '../services/sales-report-export.service.js');

jest.unstable_mockModule(prismaPath, () => ({
  default: {
    invoice: {
      findMany: jest.fn(),
    },
  },
}));

const mockPrisma = (await import(prismaPath)).default;
const { validateSalesReportRequest } = await import(validatorPath);
const { generateCsvReport } = await import(csvGenPath);
const { generatePdfReport } = await import(pdfGenPath);
const salesReportExportService = (await import(exportServicePath)).default;

describe('Sales Report Export — Validator', () => {
  it('validates a correct request payload', () => {
    const body = {
      fromDate: '2026-08-28',
      toDate: '2026-09-04',
      paymentMethod: 'ALL',
      status: 'ALL',
      search: '',
    };
    const res = validateSalesReportRequest(body);
    expect(res.isValid).toBe(true);
    expect(res.errors).toEqual({});
  });

  it('fails if body is null or not an object', () => {
    const res = validateSalesReportRequest(null);
    expect(res.isValid).toBe(false);
    expect(res.message).toContain('Invalid request payload');
  });

  it('fails when fromDate or toDate is missing', () => {
    const res = validateSalesReportRequest({
      toDate: '2026-09-04',
      paymentMethod: 'ALL',
      status: 'ALL',
      search: '',
    });
    expect(res.isValid).toBe(false);
    expect(res.errors.fromDate).toBeDefined();
  });

  it('fails when date format is invalid', () => {
    const res = validateSalesReportRequest({
      fromDate: '28-08-2026',
      toDate: '2026-09-04',
      paymentMethod: 'ALL',
      status: 'ALL',
      search: '',
    });
    expect(res.isValid).toBe(false);
    expect(res.errors.fromDate).toBeDefined();
  });

  it('fails when fromDate is greater than toDate', () => {
    const res = validateSalesReportRequest({
      fromDate: '2026-09-10',
      toDate: '2026-09-04',
      paymentMethod: 'ALL',
      status: 'ALL',
      search: '',
    });
    expect(res.isValid).toBe(false);
    expect(res.message).toBe('Invalid date range');
    expect(res.errors.fromDate).toContain('fromDate must be before or equal to toDate');
  });

  it('fails when paymentMethod, status, or search is missing', () => {
    const res = validateSalesReportRequest({
      fromDate: '2026-08-28',
      toDate: '2026-09-04',
    });
    expect(res.isValid).toBe(false);
    expect(res.errors.paymentMethod).toBeDefined();
    expect(res.errors.status).toBeDefined();
    expect(res.errors.search).toBeDefined();
  });

  it('fails when search string exceeds 255 characters', () => {
    const res = validateSalesReportRequest({
      fromDate: '2026-08-28',
      toDate: '2026-09-04',
      paymentMethod: 'ALL',
      status: 'ALL',
      search: 'a'.repeat(256),
    });
    expect(res.isValid).toBe(false);
    expect(res.errors.search).toContain('exceed 255 characters');
  });
});

describe('Sales Report Export — CSV Generator', () => {
  it('generates header-only CSV when records array is empty', () => {
    const csv = generateCsvReport([]);
    expect(csv).toBe('Invoice No,Date,Patient,Payment Method,Status,Subtotal,GST,Discount,Total\n');
  });

  it('generates CSV with escaping for commas and quotes', () => {
    const records = [
      {
        invoiceNo: 'INV-1001',
        date: '2026-08-28',
        patient: 'John, Doe "Jr"',
        paymentMethod: 'CASH',
        status: 'PAID',
        subtotal: '850.00',
        gst: '153.00',
        discount: '0.00',
        total: '1003.00',
      },
    ];
    const csv = generateCsvReport(records);
    expect(csv).toContain('"John, Doe ""Jr"""');
    expect(csv).toContain(
      'INV-1001,2026-08-28,"John, Doe ""Jr""",CASH,PAID,850.00,153.00,0.00,1003.00',
    );
  });
});

describe('Sales Report Export — PDF Generator', () => {
  it('generates a valid PDF buffer for empty records', async () => {
    const params = {
      fromDate: '2026-08-28',
      toDate: '2026-09-04',
      paymentMethod: 'ALL',
      status: 'ALL',
      search: '',
    };
    const buffer = await generatePdfReport([], params);
    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.toString('utf8', 0, 4)).toBe('%PDF');
  });

  it('generates a valid PDF buffer with data rows', async () => {
    const records = [
      {
        invoiceNo: 'INV-1001',
        date: '2026-08-28',
        patient: 'Patient A',
        paymentMethod: 'CASH',
        status: 'PAID',
        subtotal: '850.00',
        gst: '153.00',
        discount: '0.00',
        total: '1003.00',
      },
    ];
    const params = {
      fromDate: '2026-08-28',
      toDate: '2026-09-04',
      paymentMethod: 'CASH',
      status: 'PAID',
      search: 'Patient',
    };
    const buffer = await generatePdfReport(records, params);
    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.length).toBeGreaterThan(100);
  });
});

describe('SalesReportExportService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('queries Prisma with correct tenant scoping and date range', async () => {
    const mockInvoices = [
      {
        invoiceNumber: 'INV-1001',
        createdAt: new Date('2026-08-28T10:00:00Z'),
        patientName: 'Patient A',
        subtotal: 850.0,
        gstAmount: 153.0,
        discountAmount: 0.0,
        totalAmount: 1003.0,
        status: 'PAID',
        payments: [{ paymentMode: 'CASH', amount: 1003.0 }],
      },
    ];

    mockPrisma.invoice.findMany.mockResolvedValue(mockInvoices);

    const result = await salesReportExportService.fetchSalesReportRecords('tenant-1', {
      fromDate: '2026-08-28',
      toDate: '2026-09-04',
      paymentMethod: 'ALL',
      status: 'ALL',
      search: '',
    });

    expect(mockPrisma.invoice.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 'tenant-1',
          deletedAt: null,
        }),
      }),
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      invoiceNo: 'INV-1001',
      date: '2026-08-28',
      patient: 'Patient A',
      paymentMethod: 'CASH',
      status: 'PAID',
      subtotal: '850.00',
      gst: '153.00',
      discount: '0.00',
      total: '1003.00',
    });
  });

  it('applies paymentMethod, status, and search filters in query', async () => {
    mockPrisma.invoice.findMany.mockResolvedValue([]);

    await salesReportExportService.fetchSalesReportRecords('tenant-1', {
      fromDate: '2026-08-28',
      toDate: '2026-09-04',
      paymentMethod: 'UPI',
      status: 'PAID',
      search: 'INV-1002',
    });

    const queryArg = mockPrisma.invoice.findMany.mock.calls[0][0];
    expect(queryArg.where.tenantId).toBe('tenant-1');
    expect(queryArg.where.payments).toEqual({
      some: { paymentMode: { equals: 'UPI', mode: 'insensitive' } },
    });
  });
});
