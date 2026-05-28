import metadataService from '../services/metadata.service.js';
import logger from '../../../shared/utils/logger.js';

class MetadataFastifyController {
  /**
   * GET /api/medicines/:id/suppliers
   */
  async getSuppliers(request, reply) {
    const { tenantId } = request.user;
    const { id } = request.params;

    try {
      const data = await metadataService.getMedicineSuppliers(id, tenantId);
      return reply.send({ success: true, data });
    } catch (error) {
      logger.error({ error, id, tenantId }, 'Failed to fetch medicine suppliers');
      return reply.code(404).send({ success: false, message: error.message });
    }
  }

  /**
   * POST /api/medicines/:id/suppliers
   */
  async addSupplier(request, reply) {
    const { tenantId, id: userId } = request.user;
    const { id } = request.params;

    try {
      const mapping = await metadataService.addMedicineSupplier(tenantId, userId, id, request.body);
      return reply.code(201).send({ success: true, data: mapping });
    } catch (error) {
      logger.error({ error, id, tenantId }, 'Failed to add medicine supplier mapping');
      return reply.code(400).send({ success: false, message: error.message });
    }
  }

  /**
   * GET /api/medicines/:id/purchase-history
   */
  async getPurchaseHistory(request, reply) {
    const { tenantId } = request.user;
    const { id } = request.params;

    try {
      const history = await metadataService.getPurchaseHistory(id, tenantId);
      return reply.send({ success: true, data: history });
    } catch (error) {
      logger.error({ error, id, tenantId }, 'Failed to fetch purchase history');
      return reply.code(500).send({ success: false, message: 'Internal server error' });
    }
  }

  /**
   * GET /api/medicines/:id/stock-history
   */
  async getStockHistory(request, reply) {
    const { tenantId } = request.user;
    const { id } = request.params;

    try {
      const history = await metadataService.getStockHistory(id, tenantId);
      return reply.send({ success: true, data: history });
    } catch (error) {
      logger.error({ error, id, tenantId }, 'Failed to fetch stock history');
      return reply.code(500).send({ success: false, message: 'Internal server error' });
    }
  }

  /**
   * GET /api/medicines/:id/expiry-history
   */
  async getExpiryHistory(request, reply) {
    const { tenantId } = request.user;
    const { id } = request.params;

    try {
      const history = await metadataService.getExpiryHistory(id, tenantId);
      return reply.send({ success: true, data: history });
    } catch (error) {
      logger.error({ error, id, tenantId }, 'Failed to fetch expiry history');
      return reply.code(500).send({ success: false, message: 'Internal server error' });
    }
  }
}

export default new MetadataFastifyController();
