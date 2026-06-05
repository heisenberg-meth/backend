import prisma from '../../../config/prisma.js';

class ExpiryReportService {
  async getExpiryReport(tenantId, days = 30) {
    try {
      const thresholdDate = new Date();
      thresholdDate.setDate(thresholdDate.getDate() + days);

      const batches = await prisma.inventoryBatch.findMany({
        where: {
          medicine: { tenantId },
          expiryDate: { lte: thresholdDate },
          quantity: { gt: 0 },
          deletedAt: null,
        },
        include: { medicine: true, supplier: true },
        orderBy: { expiryDate: 'asc' },
      });

      const report = batches.map((batch) => {
        const now = new Date();
        const expiryDate = new Date(batch.expiryDate);
        const diffTime = expiryDate.getTime() - now.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        let severity = 'Monitor';
        if (diffDays <= 0) severity = 'Expired';
        else if (diffDays <= 7) severity = 'Critical';
        else if (diffDays <= 30) severity = 'Warning';

        return {
          id: batch.id,
          medicineName: batch.medicine.name,
          batchNumber: batch.batchNumber,
          quantity: batch.quantity,
          expiryDate: batch.expiryDate,
          daysToExpiry: diffDays,
          severity,
          estimatedLoss: batch.quantity * Number(batch.purchasePrice || 0),
          supplierName: batch.supplier?.name || 'Default Supplier',
        };
      });

      const summary = report.reduce(
        (acc, item) => {
          acc.totalLoss += Number(item.estimatedLoss || 0);
          if (item.severity === 'Expired') acc.expiredCount++;
          else if (item.severity === 'Critical') acc.criticalCount++;
          else if (item.severity === 'Warning') acc.warningCount++;
          return acc;
        },
        { totalLoss: 0, expiredCount: 0, criticalCount: 0, warningCount: 0 },
      );

      return { report, summary };
    } catch (error) {
      console.error('Error generating expiry report:', error);
      throw new Error('Failed to generate expiry report');
    }
  }
}

export default new ExpiryReportService();
