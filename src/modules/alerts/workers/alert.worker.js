import { Worker } from 'bullmq';
import { getBullRedis } from '../../../config/redis.js';
import alertEscalationEngine from '../services/escalation-engine.service.js';
import alertWorkflowService from '../services/workflow.service.js';
import alertNotificationService from '../services/notification.service.js';
import alertSeverityEngine from '../services/severity-engine.service.js';
import prisma from '../../../config/prisma.js';
import logger from '../../../shared/utils/logger.js';

class AlertWorker {
  constructor() {
    this.worker = null;
  }

  setup() {
    if (process.env.NODE_ENV === 'test') return;

    this.worker = new Worker(
      'erp-events',
      async (job) => {
        const { name, data } = job;

        try {
          switch (name) {
            case 'STOCK_LOW':
            case 'inventory.stock.low':
              await this._handleLowStock(data);
              break;

            case 'STOCK_EXPIRED':
            case 'inventory.stock.expired':
              await this._handleStockExpired(data);
              break;

            case 'ALERT_ESCALATION_SCAN': {
              const totalEscalated = await alertEscalationEngine.processEscalationQueue();
              logger.info({ totalEscalated }, '[ALERT-WORKER] Escalation scan completed');
              break;
            }
            case 'ALERT_SNOOZE_REACTIVATION': {
              const tenants = await prisma.tenant.findMany({ where: { deletedAt: null } });
              let totalReactivated = 0;
              for (const tenant of tenants) {
                const count = await alertEscalationEngine.autoReactivateSnoozedAlerts(tenant.id);
                totalReactivated += count;
              }
              logger.info({ totalReactivated }, '[ALERT-WORKER] Snooze reactivation completed');
              break;
            }
            default:
              break;
          }
        } catch (error) {
          logger.error({ error, event: name, jobId: job.id }, '[ALERT-WORKER] Job failed');
          throw error;
        }
      },
      {
        connection: getBullRedis(),
        concurrency: 5,
      },
    );

    logger.info('[ALERT-WORKER] Alert worker started and listening to erp-events queue');
  }

  async _handleLowStock(data) {
    const { tenantId, medicineId, branchId, currentStock, threshold } = data;

    const alert = await alertWorkflowService.createAlert({
      tenantId,
      medicineId,
      branchId,
      type: currentStock <= 0 ? 'OUT_OF_STOCK' : 'LOW_STOCK',
      currentStock,
      thresholdValue: threshold,
      medicineName: data.medicineName,
      branchName: data.branchName,
    });

    if (alert) {
      await alertNotificationService.dispatchAlert(alert);

      const thresholds = await alertSeverityEngine.calculatePredictiveSeverity(
        medicineId,
        tenantId,
        branchId,
        currentStock,
      );
      if (thresholds.thresholds?.autoRaisePO && thresholds.severity === 'CRITICAL') {
        try {
          const po = await alertWorkflowService.raisePurchaseOrder(
            alert.id,
            tenantId,
            'SYSTEM_AUTO',
            { priority: 'URGENT' },
          );
          logger.info(
            { poId: po.id, alertId: alert.id },
            '[ALERT-WORKER] Auto-PO raised due to critical stock breach',
          );
        } catch (poError) {
          logger.error({ poError, alertId: alert.id }, '[ALERT-WORKER] Auto-PO failed');
        }
      }
    }
  }

  async _handleStockExpired(data) {
    const { tenantId, batchId, medicineId, branchId } = data;

    const batch = await prisma.inventoryBatch.findUnique({
      where: { id: batchId },
      select: { quantity: true, purchasePrice: true, expiryDate: true, batchNumber: true },
    });

    if (!batch) return;

    const riskValue = await alertSeverityEngine.calculateExpiryRiskValue(batchId);

    await prisma.expiryAlert.updateMany({
      where: { batchId, isResolved: false },
      data: {
        severity: 'CRITICAL',
        alertStatus: 'ACTIVE',
        potentialLoss: riskValue?.riskValue || 0,
        recommendedAction: 'DESTROY',
      },
    });

    const alert = await prisma.expiryAlert.findFirst({
      where: { batchId, isResolved: false },
      include: { medicine: { select: { name: true } } },
    });

    if (alert) {
      await alertNotificationService.dispatchAlert({
        id: alert.id,
        tenantId,
        branchId,
        type: 'EXPIRED',
        severity: 'CRITICAL',
        message: `Batch ${batch.batchNumber} of ${alert.medicine?.name} has expired. ${batch.quantity} units at risk.`,
        medicineId,
      });
    }
  }
}

const alertWorkerInstance = new AlertWorker();

export const initAlertWorker = () => {
  alertWorkerInstance.setup();
};

export default alertWorkerInstance;
