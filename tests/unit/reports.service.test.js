import { jest , describe, afterEach, it, expect } from '@jest/globals';

const mockPrisma = {
  inventoryBatch: {
    findMany: jest.fn()
  }
};

jest.unstable_mockModule('../../src/config/prisma.js', () => ({
  default: mockPrisma
}));

const { default: expiryReportService } = await import('../../src/modules/reports/services/expiry_report.service.js');

describe('ExpiryReportService Unit Tests', () => {
  const tenantId = 'tenant-1';

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should categorize expiry severity correctly', async () => {
    const now = new Date();
    const expiredDate = new Date(now.getTime() - 1000 * 60 * 60 * 24); // -1 day
    const criticalDate = new Date(now.getTime() + 1000 * 60 * 60 * 24 * 3); // +3 days
    const warningDate = new Date(now.getTime() + 1000 * 60 * 60 * 24 * 15); // +15 days

    mockPrisma.inventoryBatch.findMany.mockResolvedValue([
      { id: 'b1', batchNumber: 'EXP', quantity: 10, expiryDate: expiredDate, purchasePrice: 5, medicine: { name: 'M1' } },
      { id: 'b2', batchNumber: 'CRT', quantity: 20, expiryDate: criticalDate, purchasePrice: 10, medicine: { name: 'M2' } },
      { id: 'b3', batchNumber: 'WRN', quantity: 30, expiryDate: warningDate, purchasePrice: 2, medicine: { name: 'M3' } }
    ]);

    const { report, summary } = await expiryReportService.getExpiryReport(tenantId, 30);

    expect(report).toHaveLength(3);
    expect(report.find(r => r.batchNumber === 'EXP').severity).toBe('Expired');
    expect(report.find(r => r.batchNumber === 'CRT').severity).toBe('Critical');
    expect(report.find(r => r.batchNumber === 'WRN').severity).toBe('Warning');

    // expiredCount: 1, criticalCount: 1, warningCount: 1
    expect(summary.expiredCount).toBe(1);
    expect(summary.criticalCount).toBe(1);
    expect(summary.warningCount).toBe(1);
    
    // totalLoss = (10*5) + (20*10) + (30*2) = 50 + 200 + 60 = 310
    expect(summary.totalLoss).toBe(310);
  });
});
