import alertRepository from '../repositories/alert.repository.js';
import forecastingService from '../forecasting/forecasting.service.js';
import prisma from '../../../config/prisma.js';
import logger from '../../../shared/utils/logger.js';
import eventBus from '../../../shared/services/eventbus.service.js';
import alertSettingsService from '../../alert-settings/services/alert-settings.service.js';

class RiskMonitoringService {
  /**
   * Process a stock movement and update alert snapshots
   */
  async handleStockMovement(payload) {
    const { tenantId, branchId, medicineId } = payload;

    try {
      // 1. Fetch Current Aggregate Stock for Medicine/Branch
      const totalStock = await this._calculateTotalStock(medicineId, branchId, tenantId);

      // 2. Fetch Medicine Governance Data (Thresholds)
      const thresholds = await alertSettingsService.getEffectiveThresholds(
        tenantId,
        medicineId,
        branchId,
      );
      const medicine = await prisma.medicine.findUnique({
        where: { id: medicineId },
        select: { name: true, prescriptionRequired: true },
      });

      if (!medicine) return;

      const threshold = thresholds.lowStock;

      // 3. Evaluate Alerts
      if (totalStock <= threshold) {
        const severity =
          totalStock <= thresholds.criticalStock
            ? 'CRITICAL'
            : medicine.prescriptionRequired
              ? 'CRITICAL'
              : 'WARNING';
        const alertType = totalStock <= 0 ? 'OUT_OF_STOCK' : 'LOW_STOCK';

        // Enrichment: Forecast depletion
        const daysRemaining = await forecastingService.predictDaysRemaining(
          medicineId,
          tenantId,
          branchId,
          totalStock,
        );

        await this._createStockAlert(
          tenantId,
          branchId,
          medicineId,
          alertType,
          severity,
          medicine.name,
          totalStock,
          threshold,
          daysRemaining,
        );

        // Enrichment: Check if other branches or warehouse has stock (Stock Transfer Recommendation)
        const warehouseStock = await this._checkWarehouseStock(medicineId, tenantId, branchId);
        if (warehouseStock > 0) {
          await this._createTransferRecommendation(
            tenantId,
            branchId,
            medicineId,
            medicine.name,
            warehouseStock,
          );
        }

        await eventBus.publish(`${alertType}_DETECTED`, {
          medicineId,
          branchId,
          tenantId,
          totalStock,
          daysRemaining,
        });
      } else {
        // Resolve existing alerts if stock is above threshold
        await alertRepository.resolveStockAlerts(medicineId, tenantId, branchId);
      }

      // 4. FEFO Intelligence Check: Ensure oldest batches are being used first
      await this.verifyFEFOCompliance(medicineId, tenantId, branchId);
    } catch (error) {
      logger.error({ error, medicineId }, 'Failed to monitor risk for stock movement');
    }
  }

  /**
   * Run a comprehensive scan for expiring medicines
   */
  async runExpiryScan(tenantId) {
    const now = new Date();
    // Use a conservative scan window (e.g. 90 days) but actual alerts will follow dynamic settings
    const scanWindowLater = new Date();
    scanWindowLater.setDate(now.getDate() + 90);

    const expiringBatches = await prisma.inventoryBatch.findMany({
      where: {
        medicine: { tenantId },
        expiryDate: { lte: scanWindowLater },
        quantity: { gt: 0 },
        status: 'ACTIVE',
      },
      include: { medicine: true },
    });

    for (const batch of expiringBatches) {
      const thresholds = await alertSettingsService.getEffectiveThresholds(
        tenantId,
        batch.medicineId,
        batch.branchId,
      );
      const daysRemaining = Math.ceil(
        (batch.expiryDate.getTime() - now.getTime()) / (1000 * 3600 * 24),
      );

      let severity = 'INFO';
      if (daysRemaining <= thresholds.criticalExpiry) severity = 'CRITICAL';
      else if (daysRemaining <= thresholds.expiryWarning) severity = 'WARNING';
      else if (daysRemaining <= 60) severity = 'INFO';

      if (daysRemaining < 0) severity = 'CRITICAL'; // Already expired

      // Only upsert if it breaches at least the warning threshold or is already at risk
      if (daysRemaining <= thresholds.expiryWarning || daysRemaining < 0) {
        await alertRepository.upsertExpiryAlert({
          tenantId,
          branchId: batch.branchId,
          batchId: batch.id,
          medicineId: batch.medicineId,
          severity,
          daysRemaining,
          isResolved: false,
        });

        if (severity === 'CRITICAL') {
          await eventBus.publish('EXPIRY_WARNING', {
            batchId: batch.id,
            medicineId: batch.medicineId,
            daysRemaining,
            tenantId,
          });
        }
      }
    }

    return expiringBatches.length;
  }

  /**
   * FEFO Intelligence: Detect if a newer batch is being sold while an older batch exists
   */
  async verifyFEFOCompliance(medicineId, tenantId, branchId) {
    const activeBatches = await prisma.inventoryBatch.findMany({
      where: {
        medicineId,
        medicine: { tenantId },
        ...(branchId && { branchId }),
        quantity: { gt: 0 },
        status: 'ACTIVE',
        expiryDate: { gt: new Date() },
      },
      orderBy: { expiryDate: 'asc' },
    });

    if (activeBatches.length < 2) return;

    // Logic: Check recent sales for this medicine. Did they use the 'oldest' batch?
    const recentSaleItem = await prisma.saleItem.findFirst({
      where: {
        medicineId,
        sale: { tenantId, ...(branchId && { branchId }) },
      },
      orderBy: { sale: { soldAt: 'desc' } },
      include: { batch: true },
    });

    if (recentSaleItem && recentSaleItem.batchId !== activeBatches[0].id) {
      // Potential FEFO violation: Sold from a newer batch
      const oldestBatch = activeBatches[0];
      if (recentSaleItem.batch.expiryDate > oldestBatch.expiryDate) {
        logger.warn(
          { medicineId, soldBatchId: recentSaleItem.batchId, oldestBatchId: oldestBatch.id },
          'FEFO Violation Detected',
        );
        await eventBus.publish('FEFO_VIOLATION_DETECTED', {
          medicineId,
          tenantId,
          branchId,
          soldBatchNumber: recentSaleItem.batch.batchNumber,
          oldestBatchNumber: oldestBatch.batchNumber,
        });
      }
    }
  }

  /**
   * Private: Check if central warehouse or other branches have stock
   */
  async _checkWarehouseStock(medicineId, tenantId, excludingBranchId) {
    const result = await prisma.inventoryBatch.aggregate({
      where: {
        medicineId,
        medicine: { tenantId },
        ...(excludingBranchId && { branchId: { not: excludingBranchId } }),
        status: 'ACTIVE',
        expiryDate: { gt: new Date() },
      },
      _sum: { quantity: true },
    });
    return result._sum.quantity || 0;
  }

  /**
   * Private: Create a stock transfer recommendation alert
   */
  async _createTransferRecommendation(
    tenantId,
    branchId,
    medicineId,
    medicineName,
    availableStock,
  ) {
    await alertRepository.upsertStockAlert({
      tenantId,
      branchId,
      medicineId,
      type: 'LOW_STOCK',
      severity: 'INFO',
      message: `Stock transfer recommended: ${medicineName} is low here, but ${availableStock} units are available in other branches/warehouse.`,
      currentStock: 0, // Not used for this type of alert message but required by schema
      isResolved: false,
    });
  }

  /**
   * Private: Calculate total stock across all active batches in a branch
   */
  async _calculateTotalStock(medicineId, branchId, tenantId) {
    const result = await prisma.inventoryBatch.aggregate({
      where: {
        medicineId,
        ...(branchId && { branchId }),
        medicine: { tenantId },
        status: 'ACTIVE',
        expiryDate: { gt: new Date() },
      },
      _sum: { quantity: true },
    });
    return result._sum.quantity || 0;
  }

  /**
   * Private: Create/Update stock alert record
   */
  async _createStockAlert(
    tenantId,
    branchId,
    medicineId,
    type,
    severity,
    medicineName,
    currentStock,
    threshold,
    daysRemaining,
  ) {
    let message =
      type === 'OUT_OF_STOCK'
        ? `Critical: ${medicineName} is out of stock in this branch.`
        : `Warning: ${medicineName} stock (${currentStock}) is below the reorder level (${threshold}).`;

    if (daysRemaining !== undefined && daysRemaining < 365) {
      message += ` Estimated ${daysRemaining} days of stock remaining.`;
    }

    await alertRepository.upsertStockAlert({
      tenantId,
      branchId,
      medicineId,
      type,
      severity,
      message,
      currentStock,
      thresholdValue: threshold,
    });
  }
}

export default new RiskMonitoringService();
