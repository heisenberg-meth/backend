import { localEventBus } from '../../../shared/events/local-event-bus.js';
import { DOMAIN_EVENTS } from '../../../shared/constants/events.js';
import prisma from '../../../config/prisma.js';
import logger from '../../../shared/utils/logger.js';

export const initSupplierListeners = () => {
  logger.info('[SUPPLIER-LISTENERS] Initializing Supplier Domain Listeners...');

  // Update metrics when a Purchase Order is received
  localEventBus.on(DOMAIN_EVENTS.PURCHASE_ORDER_RECEIVED, async (orderId) => {

    try {
      const order = await prisma.purchaseOrder.findUnique({
        where: { id: orderId },
        include: { supplier: true },
      });

      if (!order || !order.supplierId) return;

      const supplierId = order.supplierId;

      // Calculate delivery delay
      let delayDays = 0;
      let onTime = 1;
      if (order.expectedDeliveryDate) {
        const receivedDate = new Date();
        const diffTime = receivedDate - order.expectedDeliveryDate;
        delayDays = Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
        if (delayDays > 0) onTime = 0;
      }

      // Update SupplierMetrics
      await prisma.supplierMetrics.upsert({
        where: { supplierId },
        update: {
          totalOrders: { increment: 1 },
          onTimeDeliveries: { increment: onTime },
          averageDeliveryDays: {
            // Simple moving average
            set: await this._calculateNewAverageDelay(supplierId, delayDays),
          },
        },
        create: {
          supplierId,
          totalOrders: 1,
          onTimeDeliveries: onTime,
          averageDeliveryDays: delayDays,
        },
      });

      logger.info(
        `[SUPPLIER-METRICS] Updated metrics for supplier ${order.supplier.name} following PO reception.`,
      );
    } catch (err) {
      logger.error({ err }, '[SUPPLIER-LISTENER] Failed to update metrics on PO reception');
    }
  });

  // Handle Supplier Returns (Quality Issues)
  localEventBus.on('SUPPLIER_RETURN_CREATED', async (data) => {
    const { supplierId, qualityIssue } = data;
    if (!qualityIssue) return;

    try {
      await prisma.supplierMetrics.update({
        where: { supplierId },
        data: {
          qualityScore: { decrement: 5 } // Penalize quality score
        }
      });
    } catch (err) {
      logger.error({ err }, '[SUPPLIER-LISTENER] Failed to update metrics on return');
    }
  });
};