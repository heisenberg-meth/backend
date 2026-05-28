import prisma from '../../../config/prisma.js';
import logger from '../../../shared/utils/logger.js';
import { getIO } from '../../../config/socket.js';

const DELIVERY_STATUS = {
  ASSIGNED: 'ASSIGNED',
  PICKED_UP: 'PICKED_UP',
  OUT_FOR_DELIVERY: 'OUT_FOR_DELIVERY',
  DELIVERED: 'DELIVERED',
  FAILED: 'FAILED',
  RETURNED: 'RETURNED'
};

class DeliveryService {
  /**
   * Creates a delivery record for an online order.
   */
  async createDelivery(tenantId, orderId, riderId = null) {
    logger.info(`[DeliveryService] Creating delivery for order ${orderId}`);

    const delivery = await prisma.delivery.create({
      data: {
        tenantId,
        orderId,
        riderId,
        deliveryStatus: riderId ? DELIVERY_STATUS.ASSIGNED : 'PENDING'
      }
    });

    if (riderId) {
      await prisma.rider.update({
        where: { id: riderId },
        data: { currentStatus: 'ASSIGNED' },
      });
    }

    return delivery;
  }

  /**
   * Updates delivery status and emits events to tracking channels.
   */
  async updateDeliveryStatus(deliveryId, tenantId, status, proofOfDeliveryUrl = null) {
    const delivery = await prisma.delivery.findFirst({
      where: { id: deliveryId, tenantId },
      include: { order: true }
    });

    if (!delivery) throw new Error('Delivery not found');

    const updateData = { deliveryStatus: status };
    
    if (status === DELIVERY_STATUS.PICKED_UP) updateData.pickupTime = new Date();
    if (status === DELIVERY_STATUS.OUT_FOR_DELIVERY) updateData.outForDeliveryTime = new Date();
    if (status === DELIVERY_STATUS.DELIVERED) {
      updateData.deliveredTime = new Date();
      if (proofOfDeliveryUrl) updateData.proofOfDeliveryUrl = proofOfDeliveryUrl;
    }

    const updatedDelivery = await prisma.delivery.update({
      where: { id: deliveryId },
      data: updateData
    });

    // Notify Patient & Dashboard via Socket
    const io = getIO();
    io.to(`tenant:${tenantId}`).emit('delivery-status-updated', {
      deliveryId,
      orderId: delivery.orderId,
      status
    });

    logger.info(`[DeliveryService] Delivery ${deliveryId} updated to ${status}`);
    return updatedDelivery;
  }

  async getDeliveryByOrderId(orderId, tenantId) {
    return prisma.delivery.findFirst({
      where: { orderId, tenantId },
      include: { rider: true }
    });
  }
}

export default new DeliveryService();
