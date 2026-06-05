import prisma from '../../../config/prisma.js';

class DerivationService {
  /**
   * Sums all StockMovement quantities for the given identifiers.
   * @param {string} tenantId
   * @param {string} medicineId
   * @param {string} [batchId]
   * @returns {Promise<number>}
   */
  async calculateCurrentStock(tenantId, medicineId, batchId = null) {
    if (!tenantId || !medicineId) {
      throw new Error('[DERIVATION_SERVICE] Missing required parameters: tenantId, medicineId');
    }

    const where = { tenantId, medicineId };
    if (batchId) {
      where.batchId = batchId;
    }

    const aggregations = await prisma.stockMovement.aggregate({
      where,
      _sum: {
        quantity: true,
      },
    });

    return aggregations._sum.quantity || 0;
  }

  /**
   * Compares derived total with the current InventoryBatch.quantity
   * @param {string} tenantId
   * @param {string} medicineId
   * @param {string} [batchId]
   * @returns {Promise<Object>}
   */
  async verifyStockIntegrity(tenantId, medicineId, batchId = null) {
    const derivedQty = await this.calculateCurrentStock(tenantId, medicineId, batchId);

    let recordedQty = 0;

    if (batchId) {
      const batch = await prisma.inventoryBatch.findUnique({
        where: { id: batchId },
      });
      if (!batch || batch.tenantId !== tenantId) {
        throw new Error('[DERIVATION_SERVICE] Batch not found or unauthorized');
      }
      recordedQty = batch.quantity;
    } else {
      // Aggregate across all batches
      const aggregations = await prisma.inventoryBatch.aggregate({
        where: { tenantId, medicineId },
        _sum: { quantity: true },
      });
      recordedQty = aggregations._sum.quantity || 0;
    }

    const drift = recordedQty - derivedQty;
    const status = drift === 0 ? 'MATCH' : 'DRIFT';

    return {
      status,
      derivedQuantity: derivedQty,
      recordedQuantity: recordedQty,
      drift,
    };
  }

  /**
   * Calculates closing stock for all items as of the end of the given date.
   * @param {string} tenantId
   * @param {string|Date} date
   * @returns {Promise<Array>}
   */
  async generateDailySnapshot(tenantId, date) {
    if (!tenantId || !date) {
      throw new Error('[DERIVATION_SERVICE] Missing required parameters: tenantId, date');
    }

    const targetDate = new Date(date);
    // Set to end of day
    targetDate.setUTCHours(23, 59, 59, 999);

    const snapshotDate = new Date(targetDate);
    snapshotDate.setUTCHours(0, 0, 0, 0);

    const prevDate = new Date(targetDate);
    prevDate.setUTCDate(prevDate.getUTCDate() - 1);
    prevDate.setUTCHours(0, 0, 0, 0);

    // Limit the aggregation using tenantId to mitigate T-02-02-02
    const movements = await prisma.stockMovement.groupBy({
      by: ['medicineId'],
      where: {
        tenantId,
        createdAt: {
          lte: targetDate,
        },
      },
      _sum: {
        quantity: true,
      },
    });

    const snapshots = [];

    // Process iteratively to prevent memory overflow and limit scope (T-02-02-01)
    for (const mov of movements) {
      const medicineId = mov.medicineId;
      const closingStock = mov._sum.quantity || 0;

      const prevSnapshot = await prisma.stockSnapshot.findUnique({
        where: {
          tenantId_medicineId_snapshotDate: {
            tenantId,
            medicineId,
            snapshotDate: prevDate,
          },
        },
      });

      const openingStock = prevSnapshot ? prevSnapshot.closingStock : 0;

      const snapshot = await prisma.stockSnapshot.upsert({
        where: {
          tenantId_medicineId_snapshotDate: {
            tenantId,
            medicineId,
            snapshotDate,
          },
        },
        create: {
          tenantId,
          medicineId,
          openingStock,
          closingStock,
          snapshotDate,
        },
        update: {
          openingStock,
          closingStock,
        },
      });
      snapshots.push(snapshot);
    }

    return snapshots;
  }
}

export default new DerivationService();
