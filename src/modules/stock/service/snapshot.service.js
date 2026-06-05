import prisma from '../../../config/prisma.js';
import stockRepository from '../repositories/stock.repository.js';

class SnapshotService {
  /**
   * Run daily at midnight to capture closing stock
   */
  async captureDailySnapshots(tenantId) {
    const medicines = await prisma.medicine.findMany({
      where: { tenantId, deletedAt: null },
    });

    const snapshotDate = new Date();
    snapshotDate.setHours(0, 0, 0, 0);

    const snapshots = [];
    for (const med of medicines) {
      const current = await stockRepository.getCurrentStock(tenantId, med.id);

      // Get previous snapshot for opening stock
      const yesterday = new Date(snapshotDate);
      yesterday.setDate(yesterday.getDate() - 1);

      const prevSnapshot = await prisma.stockSnapshot.findFirst({
        where: {
          tenantId,
          medicineId: med.id,
          snapshotDate: yesterday,
        },
      });

      const openingStock = prevSnapshot ? prevSnapshot.closingStock : 0;

      const snapshot = await stockRepository.createSnapshot({
        tenantId,
        medicineId: med.id,
        openingStock,
        closingStock: current.totalQuantity,
        snapshotDate,
      });

      snapshots.push(snapshot);
    }

    return snapshots;
  }
}

export default new SnapshotService();
