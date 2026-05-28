import configurationService from '../services/configuration.service.js';
import configurationRepository from '../repositories/configuration.repository.js';
import logger from '../../../shared/utils/logger.js';

class ConfigurationController {
  /**
   * PATCH /api/medicines/:id/reorder-point
   */
  async updateReorderPoint(request, reply) {
    const { id } = request.params;
    const { tenantId, id: userId } = request.user;
    const { reorderPoint, safetyStock, maxStockLimit, branchId } = request.body;

    try {
      const config = await configurationService.updateReorderPoint(id, tenantId, {
        reorderPoint,
        safetyStock,
        maxStockLimit,
        branchId,
        updatedBy: userId
      });

      return reply.send({ success: true, data: config });
    } catch (error) {
      logger.error({ error, medicineId: id, tenantId }, 'Failed to update reorder point');
      return reply.code(400).send({ success: false, message: error.message });
    }
  }

  /**
   * PATCH /api/medicines/:id/pricing
   */
  async updatePricing(request, reply) {
    const { id } = request.params;
    const { tenantId, id: userId } = request.user;
    const { mrp, sellingPrice, purchasePrice } = request.body;

    try {
      const history = await configurationService.updatePricing(id, tenantId, {
        mrp,
        sellingPrice,
        purchasePrice,
        changedBy: userId
      });

      return reply.send({ success: true, data: history });
    } catch (error) {
      logger.error({ error, medicineId: id, tenantId }, 'Failed to update pricing');
      return reply.code(400).send({ success: false, message: error.message });
    }
  }

  /**
   * PATCH /api/medicines/:id/status
   */
  async updateStatus(request, reply) {
    const { id } = request.params;
    const { tenantId, id: userId } = request.user;
    const { status, reason } = request.body;

    try {
      const history = await configurationService.updateStatus(id, tenantId, {
        status,
        reason,
        changedBy: userId
      });

      return reply.send({ success: true, data: history });
    } catch (error) {
      logger.error({ error, medicineId: id, tenantId }, 'Failed to update medicine status');
      return reply.code(400).send({ success: false, message: error.message });
    }
  }

  /**
   * GET /api/medicines/:id/pricing-history
   */
  async getPricingHistory(request, reply) {
    const { id } = request.params;
    const { tenantId } = request.user;

    try {
      const history = await configurationRepository.getPricingHistory(id, tenantId);
      return reply.send({ success: true, data: history });
    } catch (error) {
      logger.error({ error, medicineId: id, tenantId }, 'Failed to get pricing history');
      return reply.code(500).send({ success: false, message: 'Internal server error' });
    }
  }

  /**
   * GET /api/medicines/:id/status-history
   */
  async getStatusHistory(request, reply) {
    const { id } = request.params;
    const { tenantId } = request.user;

    try {
      const history = await configurationRepository.getStatusHistory(id, tenantId);
      return reply.send({ success: true, data: history });
    } catch (error) {
      logger.error({ error, medicineId: id, tenantId }, 'Failed to get status history');
      return reply.code(500).send({ success: false, message: 'Internal server error' });
    }
  }

  /**
   * PATCH /api/medicines/bulk-pricing
   */
  async bulkUpdatePricing(request, reply) {
    const { tenantId, id: userId } = request.user;
    const { updates } = request.body; // Array of { medicineId, mrp, sellingPrice, purchasePrice }

    try {
      const results = await configurationService.bulkUpdatePricing(tenantId, updates, userId);
      return reply.send({ success: true, data: results });
    } catch (error) {
      return reply.code(400).send({ success: false, message: error.message });
    }
  }

  /**
   * GET /api/medicines/:id/reorder-analytics
   */
  async getReorderAnalytics(request, reply) {
    const { id } = request.params;
    const { tenantId, branchId } = request.user;

    try {
      const analytics = await configurationService.getReorderAnalytics(id, tenantId, branchId);
      return reply.send({ success: true, data: analytics });
    } catch (error) {
      logger.error({ error, medicineId: id, tenantId }, 'Failed to get reorder analytics');
      return reply.code(500).send({ success: false, message: 'Internal server error' });
    }
  }
}

export default new ConfigurationController();
