import loyaltyService from './loyalty.service.js';

class LoyaltyController {
  async getLoyaltyAccount(request, reply) {
    try {
      const { id } = request.params;
      const account = await loyaltyService.getLoyaltyAccount(id, request.tenantId);
      reply.send({ success: true, data: account });
    } catch (error) {
      reply.code(500).send({ success: false, message: error.message });
    }
  }

  async redeemPoints(request, reply) {
    try {
      const { id } = request.params;
      const { points } = request.body;
      const discount = await loyaltyService.redeemPoints(id, request.tenantId, points);
      reply.send({ success: true, data: { discount } });
    } catch (error) {
      reply.code(400).send({ success: false, message: error.message });
    }
  }
}

export default new LoyaltyController();
