import deliveryService from '../services/delivery.service.js';
import trackingService from '../services/tracking.service.js';

class DeliveryFastifyController {
  async updateStatus(request, reply) {
    try {
      const delivery = await deliveryService.updateDeliveryStatus(
        request.params.id,
        request.tenantId,
        request.body.status,
        request.body.proofOfDeliveryUrl,
      );
      return reply.send({ success: true, data: delivery });
    } catch (error) {
      return reply.code(400).send({ success: false, message: error.message });
    }
  }

  async updateLocation(request, reply) {
    try {
      const location = await trackingService.updateLocation(
        request.body.riderId,
        request.tenantId,
        request.body.lat,
        request.body.lon,
      );
      return reply.send({ success: true, data: location });
    } catch (error) {
      return reply.code(400).send({ success: false, message: error.message });
    }
  }

  async getTracking(request, reply) {
    try {
      const delivery = await deliveryService.getDeliveryByOrderId(
        request.params.id,
        request.tenantId,
      );
      if (!delivery) {
        return reply
          .status(404)
          .send({ success: false, message: 'Delivery not found for this order' });
      }
      const riderLocation = await trackingService.getRiderLocation(delivery.riderId);
      return reply.send({ success: true, data: { delivery, riderLocation } });
    } catch (error) {
      return reply.code(500).send({ success: false, message: error.message });
    }
  }
}

export default new DeliveryFastifyController();
