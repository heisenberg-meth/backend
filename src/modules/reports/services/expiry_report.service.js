import prisma from '../../../config/prisma.js';
import { getDaysToExpiry } from '../../../shared/utils/expiry.js';

class ExpiryReportService {
  async getExpiryReport(tenantId, days = 30) {
    try {
      const thresholdDate = new Date();
      thresholdDate.setDate(thresholdDate.getDate() + days);

      const batches = await prisma.inventoryBatch.findMany({
        where: {
          medicine: { tenantId },
          expiryDate: { lte: thresholdDate },
          availableQuantity: { gt: 0 },
          deletedAt: null,
        },
        include: { medicine: true, supplier: true },
        orderBy: { expiryDate: 'asc' },
      });

      const now = new Date();
      const report = batches.map((batch) => {
        const diffDays = getDaysToExpiry(batch.expiryDate, now);

        let severity = 'Monitor';
        if (diffDays <= 0) severity = 'Expired';
        else if (diffDays <= 7) severity = 'Critical';
        else if (diffDays <= 30) severity = 'Warning';

        const qty = batch.availableQuantity ?? batch.quantity ?? 0;

        return {
          id: batch.id,
          batchId: batch.id,
          medicineId: batch.medicineId,
          supplierId: batch.supplierId,
          medicineName: batch.medicine.name,
          batchNumber: batch.batchNumber,
          quantity: qty,
          availableQuantity: qty,
          expiryDate: batch.expiryDate,
          manufacturingDate: batch.manufacturingDate,
          daysToExpiry: diffDays,
          severity,
          purchasePrice: Number(
            batch.purchasePrice || batch.medicine?.purchasePrice || batch.medicine?.unitPrice || 0,
          ),
          estimatedLoss:
            qty *
            Number(
              batch.purchasePrice ||
                batch.medicine?.purchasePrice ||
                batch.medicine?.unitPrice ||
                0,
            ),
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
