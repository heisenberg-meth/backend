import { jest, describe, beforeEach, beforeAll, afterAll, it, expect } from '@jest/globals';
import Fastify from 'fastify';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const prismaPath = path.resolve(__dirname, '../../../config/prisma.js');
const authFastifyPath = path.resolve(__dirname, '../../../middleware/auth.fastify.js');
const permissionFastifyPath = path.resolve(__dirname, '../../../middleware/permission.fastify.js');
const featureGuardPath = path.resolve(__dirname, '../../../middleware/feature.guard.fastify.js');
const reportRoutesPath = path.resolve(__dirname, '../routes/report.fastify.routes.js');

jest.unstable_mockModule(prismaPath, () => ({
  default: {
    invoice: {
      findMany: jest.fn(),
    },
  },
}));

let currentRole = 'ADMIN';
let isAuthenticated = true;

jest.unstable_mockModule(authFastifyPath, () => ({
  authenticate: async (request, reply) => {
    if (!isAuthenticated) {
      return reply.code(401).send({ success: false, message: 'Unauthorized' });
    }
    request.user = { id: 'user-1', tenantId: 'tenant-1', role: currentRole };
    request.tenantId = 'tenant-1';
  },
  requireTenant: async (request, reply) => {
    if (!request.tenantId) {
      return reply.code(400).send({ success: false, message: 'Tenant ID required' });
    }
  },
}));

jest.unstable_mockModule(permissionFastifyPath, () => ({
  requirePermission: () => async (request, reply) => {
    if (currentRole === 'NO_REPORTS_ROLE') {
      return reply
        .code(403)
        .send({ success: false, message: 'Permission denied: reports.read required' });
    }
  },
}));

jest.unstable_mockModule(featureGuardPath, () => ({
  requireFeature: () => async () => {},
}));

const mockPrisma = (await import(prismaPath)).default;
const { default: reportRoutes } = await import(reportRoutesPath);

describe('Sales Report Export API Integration', () => {
  let app;

  beforeAll(async () => {
    app = Fastify();
    await app.register(reportRoutes, { prefix: '/api/reports' });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    currentRole = 'ADMIN';
    isAuthenticated = true;
  });

  const validPayload = {
    fromDate: '2026-08-28',
    toDate: '2026-09-04',
    paymentMethod: 'ALL',
    status: 'ALL',
    search: '',
  };

  it('POST /api/reports/sales/export/csv returns 200 with CSV headers and content', async () => {
    mockPrisma.invoice.findMany.mockResolvedValue([
      {
        invoiceNumber: 'INV-2001',
        createdAt: new Date('2026-08-30T14:30:00Z'),
        patientName: 'Jane Smith',
        subtotal: 1200.0,
        gstAmount: 216.0,
        discountAmount: 100.0,
        totalAmount: 1316.0,
        status: 'PAID',
        payments: [{ paymentMode: 'UPI', amount: 1316.0 }],
      },
    ]);

    const response = await app.inject({
      method: 'POST',
      url: '/api/reports/sales/export/csv',
      payload: validPayload,
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/csv');
    expect(response.headers['content-disposition']).toBe(
      'attachment; filename="sales-report-2026-08-28-to-2026-09-04.csv"',
    );
    expect(response.payload).toContain(
      'Invoice No,Date,Patient,Payment Method,Status,Subtotal,GST,Discount,Total',
    );
    expect(response.payload).toContain(
      'INV-2001,2026-08-30,Jane Smith,UPI,PAID,1200.00,216.00,100.00,1316.00',
    );
  });

  it('POST /api/reports/sales/export/pdf returns 200 with PDF headers and binary buffer', async () => {
    mockPrisma.invoice.findMany.mockResolvedValue([
      {
        invoiceNumber: 'INV-2001',
        createdAt: new Date('2026-08-30T14:30:00Z'),
        patientName: 'Jane Smith',
        subtotal: 1200.0,
        gstAmount: 216.0,
        discountAmount: 100.0,
        totalAmount: 1316.0,
        status: 'PAID',
        payments: [{ paymentMode: 'UPI', amount: 1316.0 }],
      },
    ]);

    const response = await app.inject({
      method: 'POST',
      url: '/api/reports/sales/export/pdf',
      payload: validPayload,
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('application/pdf');
    expect(response.headers['content-disposition']).toBe(
      'attachment; filename="sales-report-2026-08-28-to-2026-09-04.pdf"',
    );
    expect(response.rawPayload.toString('utf8', 0, 4)).toBe('%PDF');
  });

  it('returns 400 Bad Request for validation error (e.g. fromDate > toDate)', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/reports/sales/export/csv',
      payload: { ...validPayload, fromDate: '2026-09-10', toDate: '2026-09-04' },
    });

    expect(response.statusCode).toBe(400);
    const json = JSON.parse(response.payload);
    expect(json.success).toBe(false);
    expect(json.message).toBe('Invalid date range');
    expect(json.errors.fromDate).toBeDefined();
  });

  it('returns 401 Unauthorized when unauthenticated', async () => {
    isAuthenticated = false;

    const response = await app.inject({
      method: 'POST',
      url: '/api/reports/sales/export/csv',
      payload: validPayload,
    });

    expect(response.statusCode).toBe(401);
  });

  it('returns 403 Forbidden when missing permission', async () => {
    currentRole = 'NO_REPORTS_ROLE';

    const response = await app.inject({
      method: 'POST',
      url: '/api/reports/sales/export/pdf',
      payload: validPayload,
    });

    expect(response.statusCode).toBe(403);
  });

  it('returns 200 with header-only CSV when no sales match filters', async () => {
    mockPrisma.invoice.findMany.mockResolvedValue([]);

    const response = await app.inject({
      method: 'POST',
      url: '/api/reports/sales/export/csv',
      payload: validPayload,
    });

    expect(response.statusCode).toBe(200);
    expect(response.payload).toBe(
      'Invoice No,Date,Patient,Payment Method,Status,Subtotal,GST,Discount,Total\n',
    );
  });
});
