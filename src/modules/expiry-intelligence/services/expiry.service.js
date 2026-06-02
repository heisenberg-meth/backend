import batchRepository from '../repositories/batch.repository.js';
import expiryAlertRepository from '../repositories/expiry_alert.repository.js';
import prisma from '../../../config/prisma.js';
import eventBus from '../../../shared/services/eventbus.service.js';
import inventoryService from '../../realtime-inventory/services/inventory.service.js';

class ExpiryService {
  async processExpiryScan() {
    const tenants = await prisma.tenant.findMany({ where: { deletedAt: null } });

    for (const tenant of tenants) {
      const batches = await batchRepository.findAll(tenant.id, { status: 'ACTIVE', minQty: 1 });

      const now = new Date();

      for (const batch of batches) {
        const diffTime = batch.expiryDate - now;
        const daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (daysRemaining <= 0) {
          await batchRepository.updateStatus(batch.id, 'EXPIRED');

          await inventoryService.recordTransaction(
            prisma,
            tenant.id,
            {
              medicineId: batch.medicineId,
              batchId: batch.id,
              branchId: batch.branchId,
              transactionType: 'EXPIRY',
              quantityChange: -batch.quantity,
              quantityAfter: 0,
              referenceType: 'SYSTEM_EXPIRY',
              notes: 'Auto-expired by system scan',
            },
            'SYSTEM',
          );

          await this.triggerExpiryAlert(tenant.id, batch, 'Critical', daysRemaining);
        } else if (daysRemaining <= 30) {
          await batchRepository.updateStatus(batch.id, 'NEAR_EXPIRY');
          await this.triggerExpiryAlert(tenant.id, batch, 'Warning', daysRemaining);
        } else if (daysRemaining <= 90) {
          await this.triggerExpiryAlert(tenant.id, batch, 'Monitor', daysRemaining);
        }
      }
    }
  }

  async triggerExpiryAlert(tenantId, batch, severity, daysRemaining) {
    const existing = await expiryAlertRepository.findExistingAlert(tenantId, batch.id, severity);
    if (existing) return;

    const alert = await expiryAlertRepository.createAlert({
      tenantId,
      batchId: batch.id,
      medicineId: batch.medicineId,
      severity,
      daysRemaining,
    });

    await eventBus.publish('EXPIRY_ALERT_CREATED', alert);
  }

  async getActiveAlerts(tenantId) {
    return expiryAlertRepository.findActiveAlerts(tenantId);
  }

  async resolveAlert(id, tenantId) {
    return expiryAlertRepository.resolveAlert(id, tenantId);
  }

  async getCriticalAlerts(tenantId) {
    return expiryAlertRepository.findCriticalAlerts(tenantId);
  }
}

export default new ExpiryService();
