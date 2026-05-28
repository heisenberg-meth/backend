import medicineAlertService from '../services/medicine-alert.service.js';
import logger from '../../../shared/utils/logger.js';

class RiskFastifyController {
  /**
   * GET /api/medicines/low-stock
   */
  async getLowStockAlerts(request, reply) {
    const { tenantId, branchId } = request.user;
    const { severity, page, limit } = request.query;

    try {
      const data = await medicineAlertService.getLowStockAlerts(tenantId, {
        branchId,
        severity,
        page: parseInt(page),
        limit: parseInt(limit)
      });
      return reply.send({ success: true, data });
    } catch (error) {
      logger.error({ error, tenantId }, 'Failed to fetch low stock alerts');
      return reply.code(500).send({ success: false, message: 'Internal server error' });
    }
  }

  /**
   * GET /api/medicines/expiring
   */
  async getExpiryAlerts(request, reply) {
    const { tenantId, branchId } = request.user;
    const { severity, page, limit } = request.query;

    try {
      const data = await medicineAlertService.getExpiryAlerts(tenantId, {
        branchId,
        severity,
        page: parseInt(page),
        limit: parseInt(limit)
      });
      return reply.send({ success: true, data });
    } catch (error) {
      logger.error({ error, tenantId }, 'Failed to fetch expiry alerts');
      return reply.code(500).send({ success: false, message: 'Internal server error' });
    }
  }

  /**
   * GET /api/medicines/out-of-stock
   */
  async getOutOfStock(request, reply) {
    const { tenantId, branchId } = request.user;

    try {
      const data = await medicineAlertService.getOutOfStockAlerts(tenantId, {
        branchId,
        page: 1,
        limit: 100
      });

      return reply.send({ success: true, data: data.alerts });
    } catch (error) {
      logger.error({ error, tenantId }, 'Failed to fetch out of stock alerts');
      return reply.code(500).send({ success: false, message: 'Internal server error' });
    }
  }

  /**
   * GET /api/medicines/critical-alerts
   */
  async getCriticalAlerts(request, reply) {
    const { tenantId, branchId } = request.user;
    try {
      const data = await medicineAlertService.getCriticalAlerts(tenantId, { branchId });
      return reply.send({ success: true, data });
    } catch (error) {
      logger.error({ error, tenantId }, 'Failed to fetch critical alerts');
      return reply.code(500).send({ success: false, message: 'Internal server error' });
    }
  }

  /**
   * GET /api/medicines/expiry-summary
   */
  async getExpirySummary(request, reply) {
    const { tenantId, branchId } = request.user;
    try {
      const data = await medicineAlertService.getExpirySummary(tenantId, { branchId });
      return reply.send({ success: true, data });
    } catch (error) {
      logger.error({ error, tenantId }, 'Failed to fetch expiry summary');
      return reply.code(500).send({ success: false, message: 'Internal server error' });
    }
  }

  /**
   * GET /api/medicines/alert-trends
   */
  async getAlertTrends(request, reply) {
    const { tenantId, branchId } = request.user;
    try {
      const data = await medicineAlertService.getAlertTrends(tenantId, { branchId });
      return reply.send({ success: true, data });
    } catch (error) {
      logger.error({ error, tenantId }, 'Failed to fetch alert trends');
      return reply.code(500).send({ success: false, message: 'Internal server error' });
    }
  }

  /**
   * POST /api/medicines/alerts/scan (Manual trigger for testing/admin)
   */
  async triggerExpiryScan(request, reply) {
    const { tenantId } = request.user;
    
    try {
      const result = await medicineAlertService.triggerFullScan(tenantId);
      return reply.send({ success: true, data: result });
    } catch (error) {
      return reply.code(500).send({ success: false, message: error.message });
    }
  }

  /**
   * GET /api/medicines/reorder-recommendations
   */
  async getReorderRecommendations(request, reply) {
    const { tenantId, branchId } = request.user;
    const { id: medicineId } = request.query;

    try {
      const recommendations = await medicineAlertService.getReorderRecommendations(tenantId, {
        branchId,
        medicineId
      });
      return reply.send({ success: true, data: recommendations });
    } catch (error) {
      logger.error({ error, tenantId }, 'Failed to generate reorder recommendations');
      return reply.code(500).send({ success: false, message: 'Internal server error' });
    }
  }
}

export default new RiskFastifyController();
