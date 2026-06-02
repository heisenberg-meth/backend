import prisma from '../../../config/prisma.js';
import logger from '../../../shared/utils/logger.js';
import riderService from './rider.service.js';
import deliveryService from './delivery.service.js';
import { mainQueue } from '../../../queue/index.js';

class DispatchService {
  /**
   * Assigns a rider to a delivery.
   * Uses simple nearest-rider logic or manual assignment.
   */
  async assignRider(tenantId, deliveryId, manualRiderId = null) {
    logger.info(`[DispatchService] Assigning rider to delivery ${deliveryId}`);

    const delivery = await prisma.delivery.findFirst({
      where: { id: deliveryId, tenantId },
      include: { order: true },
    });

    if (!delivery) throw new Error('Delivery not found');

    let riderId = manualRiderId;

    if (!riderId) {
      const rider = await riderService.findNearestRider(
        tenantId,
        delivery.order.deliveryLatitude,
        delivery.order.deliveryLongitude,
      );

      if (!rider) {
        logger.warn(
          `[DispatchService] No riders available for delivery ${deliveryId}. Queuing auto-assignment.`,
        );
        await mainQueue.add('auto-assign-rider', { tenantId, deliveryId }, { delay: 300000 });
        return { status: 'QUEUED', message: 'No riders available. Assignment queued.' };
      }

      riderId = rider.id;
    }

    await prisma.delivery.update({
      where: { id: deliveryId },
      data: { riderId, deliveryStatus: 'ASSIGNED' },
    });

    await riderService.updateRiderStatus(riderId, 'ASSIGNED');

    logger.info(`[DispatchService] Rider ${riderId} assigned to delivery ${deliveryId}`);
    return { status: 'SUCCESS', riderId };
  }

  async handleOrderReady(tenantId, orderId) {
    logger.info(`[DispatchService] Handling ready order: ${orderId}`);

    const delivery = await deliveryService.createDelivery(tenantId, orderId);

    await this.assignRider(tenantId, delivery.id);
  }
}

export default new DispatchService();
