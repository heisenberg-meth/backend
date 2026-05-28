import catalogService from '../services/catalog.service.js';
import inventorySyncService from '../services/inventory-sync.service.js';

class StorefrontFastifyController {
  async getCatalog(request, reply) {
    try {
      const catalog = await catalogService.getPublicCatalog(request.params.tenantId, request.query);
      return reply.send({ success: true, data: catalog });
    } catch (error) {
      return reply.code(500).send({ success: false, message: error.message });
    }
  }

  async reconcile(request, reply) {
    try {
      const result = await inventorySyncService.reconcileFullInventory(request.tenantId);
      return reply.send({
        success: true,
        message: 'Inventory reconciliation triggered',
        data: result,
      });
    } catch (error) {
      return reply.code(500).send({ success: false, message: error.message });
    }
  }
}

export default new StorefrontFastifyController();
