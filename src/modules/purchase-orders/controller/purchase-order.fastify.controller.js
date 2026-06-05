import purchaseOrderService from '../service/purchase-order.service.js';
import logger from '../../../shared/utils/logger.js';

class PurchaseOrderFastifyController {
  async getOrders(request, reply) {
    const tenantId = request.tenantId;
    const filters = request.query;
    try {
      const orders = await purchaseOrderService.getOrders(tenantId, filters);
      return reply.send({ success: true, data: orders });
    } catch (error) {
      logger.error({ error, tenantId }, 'Failed to get purchase orders');
      return reply.code(500).send({ success: false, error: 'Failed to retrieve purchase orders' });
    }
  }

  async getPendingOrders(request, reply) {
    const tenantId = request.tenantId;
    try {
      const statuses = [
        'DRAFT',
        'PENDING_APPROVAL',
        'APPROVED',
        'SENT',
        'PARTIALLY_RECEIVED',
        'ORDERED',
      ];
      const orders = await purchaseOrderService.getOrdersByStatus(tenantId, statuses);
      return reply.send({ success: true, data: orders });
    } catch {
      return reply.code(500).send({ success: false, error: 'Failed to retrieve pending orders' });
    }
  }

  async getCompletedOrders(request, reply) {
    const tenantId = request.tenantId;
    try {
      const statuses = ['RECEIVED', 'RECONCILED'];
      const orders = await purchaseOrderService.getOrdersByStatus(tenantId, statuses);
      return reply.send({ success: true, data: orders });
    } catch {
      return reply.code(500).send({ success: false, error: 'Failed to retrieve completed orders' });
    }
  }

  async getOrdersBySupplier(request, reply) {
    const { supplierId } = request.params;
    const tenantId = request.tenantId;
    try {
      const orders = await purchaseOrderService.getOrdersBySupplier(tenantId, supplierId);
      return reply.send({ success: true, data: orders });
    } catch {
      return reply.code(500).send({ success: false, error: 'Failed to retrieve supplier orders' });
    }
  }

  async getOrder(request, reply) {
    const { id } = request.params;
    const tenantId = request.tenantId;
    try {
      const order = await purchaseOrderService.getOrderById(tenantId, id);
      return reply.send({ success: true, data: order });
    } catch (error) {
      return reply.code(404).send({ success: false, error: error.message });
    }
  }

  async createOrder(request, reply) {
    const tenantId = request.tenantId;
    const userId = request.user.id;
    try {
      const order = await purchaseOrderService.createOrder(tenantId, userId, request.body);
      return reply.code(201).send({ success: true, data: order });
    } catch (error) {
      logger.error({ error, tenantId }, 'Failed to create purchase order');
      return reply.code(400).send({ success: false, error: error.message });
    }
  }

  async approveOrder(request, reply) {
    const { id } = request.params;
    const { notes } = request.body;
    const tenantId = request.tenantId;
    const userId = request.user.id;
    try {
      const order = await purchaseOrderService.approveOrder(tenantId, id, userId, notes);
      return reply.send({ success: true, data: order, message: 'Purchase order approved' });
    } catch (error) {
      return reply.code(400).send({ success: false, error: error.message });
    }
  }

  async receiveOrder(request, reply) {
    const { id } = request.params;
    const tenantId = request.tenantId;
    const userId = request.user.id;
    try {
      const result = await purchaseOrderService.receiveOrder(tenantId, id, userId, request.body);
      return reply.send({
        success: true,
        data: result.grn,
        orderStatus: result.orderStatus,
        message: 'Inventory received and batches registered',
      });
    } catch (error) {
      logger.error({ error, id, tenantId }, 'Failed to receive purchase order');
      return reply.code(400).send({ success: false, error: error.message });
    }
  }

  async cancelOrder(request, reply) {
    const { id } = request.params;
    const { reason } = request.body;
    const tenantId = request.tenantId;
    const userId = request.user.id;
    try {
      const order = await purchaseOrderService.cancelOrder(tenantId, id, userId, reason);
      return reply.send({ success: true, data: order, message: 'Purchase order cancelled' });
    } catch (error) {
      return reply.code(400).send({ success: false, error: error.message });
    }
  }

  async updateStatus(request, reply) {
    const { id } = request.params;
    const { status } = request.body;
    const tenantId = request.tenantId;
    try {
      const order = await purchaseOrderService.updateStatus(id, tenantId, status);
      return reply.send({ success: true, data: order });
    } catch (error) {
      return reply.code(400).send({ success: false, error: error.message });
    }
  }
}

export default new PurchaseOrderFastifyController();
