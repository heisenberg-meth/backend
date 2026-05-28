import prisma from '../../../config/prisma.js';

class AlertAuditService {
  async logAlertDismissal(alertId, tenantId, userId, reason = null) {
    return prisma.auditLog.create({
      data: {
        tenantId,
        type: 'INVENTORY',
        action: 'ALERT_DISMISSED',
        entityId: alertId,
        entityType: 'StockAlert',
        userId,
        details: JSON.stringify({ reason, dismissedAt: new Date().toISOString() }),
        ipAddress: null,
        userAgent: null,
      },
    });
  }

  async logAlertOverride(alertId, tenantId, userId, previousValue, newValue, reason = null) {
    return prisma.auditLog.create({
      data: {
        tenantId,
        type: 'INVENTORY',
        action: 'ALERT_OVERRIDE',
        entityId: alertId,
        entityType: 'StockAlert',
        userId,
        details: JSON.stringify({
          previousValue,
          newValue,
          reason,
          overriddenAt: new Date().toISOString(),
        }),
        ipAddress: null,
        userAgent: null,
      },
    });
  }

  async logThresholdChange(tenantId, userId, medicineId, previousThreshold, newThreshold, reason = null) {
    return prisma.auditLog.create({
      data: {
        tenantId,
        type: 'INVENTORY',
        action: 'THRESHOLD_CHANGED',
        entityId: medicineId,
        entityType: 'Medicine',
        userId,
        details: JSON.stringify({
          previousThreshold,
          newThreshold,
          reason,
          changedAt: new Date().toISOString(),
        }),
        ipAddress: null,
        userAgent: null,
      },
    });
  }

  async logProcurementAcknowledgement(tenantId, userId, alertId, poId = null) {
    return prisma.auditLog.create({
      data: {
        tenantId,
        type: 'INVENTORY',
        action: 'PROCUREMENT_ACKNOWLEDGED',
        entityId: alertId,
        entityType: 'StockAlert',
        userId,
        details: JSON.stringify({
          poId,
          acknowledgedAt: new Date().toISOString(),
        }),
        ipAddress: null,
        userAgent: null,
      },
    });
  }

  async logScanExecution(tenantId, userId, result) {
    return prisma.auditLog.create({
      data: {
        tenantId,
        type: 'INVENTORY',
        action: 'ALERT_SCAN_EXECUTED',
        entityId: tenantId,
        entityType: 'Tenant',
        userId,
        details: JSON.stringify({
          expiryAlerts: result.expiryAlerts,
          stockAlerts: result.stockAlerts,
          total: result.total,
          executedAt: new Date().toISOString(),
        }),
        ipAddress: null,
        userAgent: null,
      },
    });
  }

  async getAuditTrail(tenantId, options = {}) {
    const { days = 30, action, userId } = options;

    const since = new Date();
    since.setDate(since.getDate() - days);

    const where = {
      tenantId,
      type: 'INVENTORY',
      createdAt: { gte: since },
    };

    if (action) {
      where.action = action;
    }

    if (userId) {
      where.userId = userId;
    }

    return prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: options.limit || 100,
      include: {
        user: { select: { fullName: true, email: true, role: true } },
      },
    });
  }
}

export default new AlertAuditService();
