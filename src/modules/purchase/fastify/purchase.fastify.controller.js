import supplierReturnService from '../services/supplier-return.service.js';
import stockInService from '../services/stock-in.service.js';

class PurchaseFastifyController {
  async receiveGoods(request, reply) {
    try {
      const result = await stockInService.receiveGoods(
        request.tenantId,
        request.body,
        request.user.id,
      );
      return reply.code(201).send({ success: true, data: result });
    } catch (error) {
      request.log.error({ err: error, tenantId: request.tenantId }, 'Purchase receive failed');
      return reply.code(400).send({ success: false, message: error.message });
    }
  }

  async createReturn(request, reply) {
    try {
      const { items, reason, supplierId } = request.body;

      if (!Array.isArray(items) || items.length === 0) {
        return reply.code(400).send({ success: false, message: 'Return items required' });
      }

      const results = [];
      for (const item of items) {
        const result = await supplierReturnService.processReturn(
          request.tenantId,
          {
            batchId: item.batchId,
            quantity: Number(item.quantity) || 1,
            supplierId,
            reason: reason || 'Return',
          },
          request.user.id,
        );
        results.push(result);
      }

      return reply.code(201).send({ success: true, data: results });
    } catch (error) {
      request.log.error({ err: error, tenantId: request.tenantId }, 'Purchase return failed');
      return reply.code(400).send({ success: false, message: error.message });
    }
  }

  async getReturns(request, reply) {
    try {
      const { page, limit } = request.query;
      const result = await supplierReturnService.getReturns(
        request.tenantId,
        parseInt(page) || 1,
        parseInt(limit) || 20,
      );
      return reply.send({ success: true, data: result });
    } catch (error) {
      request.log.error({ err: error, tenantId: request.tenantId }, 'Get purchase returns failed');
      return reply.code(500).send({ success: false, message: error.message });
    }
  }
}

export default new PurchaseFastifyController();
