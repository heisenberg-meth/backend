import prisma from '../../../config/prisma.js';
import alertWorkflowService from '../services/workflow.service.js';
import alertAnalyticsService from '../services/analytics.service.js';
import alertEscalationEngine from '../services/escalation-engine.service.js';

class AlertFastifyController {
  async getAll(request, reply) {
    const tenantId = request.tenantId;
    const branchId = request.user?.branchId;
    const { page = 1, limit = 50, status } = request.query;

    const where = {
      tenantId,
      branchId: branchId || undefined,
      isResolved: status === 'RESOLVED' ? true : status === 'ACTIVE' ? false : undefined,
    };
    if (status && !['RESOLVED', 'ACTIVE'].includes(status)) {
      where.alertStatus = status;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const take = parseInt(limit);

    const [alerts, total] = await Promise.all([
      prisma.stockAlert.findMany({
        where,
        include: { medicine: { select: { name: true, genericName: true, prescriptionRequired: true } }, branch: { select: { name: true, code: true } } },
        orderBy: { createdAt: 'desc' }, skip, take,
      }),
      prisma.stockAlert.count({ where }),
    ]);

    return reply.send({ success: true, data: { alerts, pagination: { total, page: parseInt(page), limit: take, totalPages: Math.ceil(total / take) } } });
  }

  async getLowStock(request, reply) {
    const tenantId = request.tenantId;
    const branchId = request.user?.branchId;
    const { severity, status, page = 1, limit = 50 } = request.query;

    const where = { tenantId, branchId: branchId || undefined, type: { in: ['LOW_STOCK', 'OUT_OF_STOCK'] }, isResolved: false };
    if (severity) where.severity = severity;
    if (status) where.alertStatus = status;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const take = parseInt(limit);

    const [alerts, total] = await Promise.all([
      prisma.stockAlert.findMany({
        where,
        include: { medicine: { select: { name: true, genericName: true, prescriptionRequired: true, reorderLevel: true } }, branch: { select: { name: true, code: true } } },
        orderBy: [{ severity: 'desc' }, { daysRemaining: 'asc' }], skip, take,
      }),
      prisma.stockAlert.count({ where }),
    ]);

    return reply.send({ success: true, data: { alerts, pagination: { total, page: parseInt(page), limit: take, totalPages: Math.ceil(total / take) } } });
  }

  async getExpiring(request, reply) {
    const tenantId = request.tenantId;
    const branchId = request.user?.branchId;
    const { severity, status, page = 1, limit = 50 } = request.query;

    const where = { tenantId, branchId: branchId || undefined, isResolved: false };
    if (severity) where.severity = severity;
    if (status) where.alertStatus = status;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const take = parseInt(limit);

    const [alerts, total] = await Promise.all([
      prisma.expiryAlert.findMany({
        where,
        include: { medicine: { select: { name: true, genericName: true } }, batch: { select: { batchNumber: true, quantity: true, expiryDate: true, purchasePrice: true } }, branch: { select: { name: true, code: true } } },
        orderBy: { daysRemaining: 'asc' }, skip, take,
      }),
      prisma.expiryAlert.count({ where }),
    ]);

    const enriched = alerts.map((a) => ({ ...a, potentialLoss: a.batch?.quantity * a.batch?.purchasePrice || 0 }));
    return reply.send({ success: true, data: { alerts: enriched, pagination: { total, page: parseInt(page), limit: take, totalPages: Math.ceil(total / take) } } });
  }

  async getCritical(request, reply) {
    const tenantId = request.tenantId;
    const branchId = request.user?.branchId;

    const [criticalStock, criticalExpiry] = await Promise.all([
      prisma.stockAlert.findMany({ where: { tenantId, branchId: branchId || undefined, severity: 'CRITICAL', alertStatus: { in: ['ACTIVE', 'ESCALATED'] }, isResolved: false }, include: { medicine: { select: { name: true, prescriptionRequired: true } }, branch: { select: { name: true, code: true } } }, orderBy: { createdAt: 'desc' }, take: 50 }),
      prisma.expiryAlert.findMany({ where: { tenantId, branchId: branchId || undefined, severity: 'CRITICAL', alertStatus: { in: ['ACTIVE', 'ESCALATED'] }, isResolved: false }, include: { medicine: { select: { name: true } }, batch: { select: { batchNumber: true, quantity: true, expiryDate: true } } }, orderBy: { daysRemaining: 'asc' }, take: 50 }),
    ]);

    return reply.send({ success: true, data: { stockAlerts: criticalStock, expiryAlerts: criticalExpiry, totalCritical: criticalStock.length + criticalExpiry.length } });
  }

  async getEscalated(request, reply) {
    const tenantId = request.tenantId;
    const branchId = request.user?.branchId;
    const { days = 30 } = request.query;

    const since = new Date();
    since.setDate(since.getDate() - parseInt(days));

    const alerts = await prisma.stockAlert.findMany({
      where: { tenantId, branchId: branchId || undefined, alertStatus: 'ESCALATED', escalatedAt: { gte: since } },
      include: { medicine: { select: { name: true, prescriptionRequired: true } }, branch: { select: { name: true, code: true } } },
      orderBy: { escalationCount: 'desc' },
    });

    return reply.send({ success: true, data: alerts });
  }

  async snooze(request, reply) {
    const data = await alertWorkflowService.snoozeAlert(request.params.alertId, request.tenantId, request.user.id, request.body);
    return reply.send({ success: true, data });
  }

  async markOnOrder(request, reply) {
    const data = await alertWorkflowService.acknowledgeAlert(request.params.alertId, request.tenantId, request.user.id, request.body);
    return reply.send({ success: true, data });
  }

  async raisePurchaseOrder(request, reply) {
    const data = await alertWorkflowService.raisePurchaseOrder(request.params.alertId, request.tenantId, request.user.id, request.body);
    return reply.send({ success: true, data });
  }

  async resolve(request, reply) {
    const data = await alertWorkflowService.resolveAlert(request.params.alertId, request.tenantId, request.user.id, request.body);
    return reply.send({ success: true, data });
  }

  async getAnalytics(request, reply) {
    const tenantId = request.tenantId;
    const branchId = request.user?.branchId;
    const { days = 30 } = request.query;

    const [summary, trends, topMedicines, escalationReport] = await Promise.all([
      alertAnalyticsService.getAlertSummary(tenantId, { branchId, days: parseInt(days) }),
      alertAnalyticsService.getAlertTrends(tenantId, { branchId, days: parseInt(days) }),
      alertAnalyticsService.getMostAlertedMedicines(tenantId, { branchId, days: parseInt(days) }),
      alertAnalyticsService.getEscalationReport(tenantId, { days: parseInt(days) }),
    ]);

    return reply.send({ success: true, data: { summary, trends, topMedicines, escalationReport } });
  }

  async triggerEscalationScan(request, reply) {
    const totalEscalated = await alertEscalationEngine.processEscalationQueue();
    return reply.send({ success: true, data: { totalEscalated } });
  }
}

export default new AlertFastifyController();
