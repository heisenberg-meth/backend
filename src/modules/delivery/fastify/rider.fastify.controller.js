import riderService from '../services/rider.service.js';

class RiderFastifyController {
  async register(request, reply) {
    try {
      const rider = await riderService.registerRider(request.tenantId, request.body);
      return reply.code(201).send({ success: true, data: rider });
    } catch (error) {
      return reply.code(400).send({ success: false, message: error.message });
    }
  }

  async getAvailable(request, reply) {
    try {
      const riders = await riderService.getAvailableRiders(request.tenantId);
      return reply.send({ success: true, data: riders });
    } catch (error) {
      return reply.code(500).send({ success: false, message: error.message });
    }
  }
}

export default new RiderFastifyController();
