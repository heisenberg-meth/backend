import orderService from '../services/order.service.js';

class OrderFastifyController {
  async create(request, reply) {
    try {
      const order = await orderService.createOrder(
        request.tenantId,
        request.body.patientId,
        request.body,
      );
      return reply.code(201).send({ success: true, data: order });
    } catch (error) {
      return reply.code(400).send({ success: false, message: error.message });
    }
  }

  async updateStatus(request, reply) {
    try {
      const order = await orderService.updateOrderStatus(
        request.params.id,
        request.tenantId,
        request.body.status,
      );
      return reply.send({ success: true, data: order });
    } catch (error) {
      return reply.code(400).send({ success: false, message: error.message });
    }
  }
}

export default new OrderFastifyController();
