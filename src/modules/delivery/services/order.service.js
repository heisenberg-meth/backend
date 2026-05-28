import prisma from '../../../config/prisma.js';
import logger from '../../../shared/utils/logger.js';
import reservationService from './inventory-reservation.service.js';
import dispatchService from './dispatch.service.js';

const ORDER_STATUS = {
  PENDING: 'PENDING',
  CONFIRMED: 'CONFIRMED',
  PACKING: 'PACKING',
  READY_FOR_PICKUP: 'READY_FOR_PICKUP',
  OUT_FOR_DELIVERY: 'OUT_FOR_DELIVERY',
  DELIVERED: 'DELIVERED',
  CANCELLED: 'CANCELLED',
  FAILED: 'FAILED',
  RETURNED: 'RETURNED'
};

const VALID_TRANSITIONS = {
  [ORDER_STATUS.PENDING]: [ORDER_STATUS.CONFIRMED, ORDER_STATUS.CANCELLED],
  [ORDER_STATUS.CONFIRMED]: [ORDER_STATUS.PACKING, ORDER_STATUS.CANCELLED],
  [ORDER_STATUS.PACKING]: [ORDER_STATUS.READY_FOR_PICKUP, ORDER_STATUS.CANCELLED],
  [ORDER_STATUS.READY_FOR_PICKUP]: [ORDER_STATUS.OUT_FOR_DELIVERY, ORDER_STATUS.FAILED],
  [ORDER_STATUS.OUT_FOR_DELIVERY]: [
    ORDER_STATUS.DELIVERED,
    ORDER_STATUS.FAILED,
    ORDER_STATUS.RETURNED,
  ],
  [ORDER_STATUS.DELIVERED]: [], // Terminal
  [ORDER_STATUS.CANCELLED]: [], // Terminal
  [ORDER_STATUS.FAILED]: [ORDER_STATUS.READY_FOR_PICKUP, ORDER_STATUS.RETURNED],
  [ORDER_STATUS.RETURNED]: [], // Terminal
};

class OrderService {
  /**
   * Creates a new online order and reserves inventory.
   */
  async createOrder(tenantId, patientId, data) {
    logger.info(`[OrderService] Creating online order for patient ${patientId}`);

    const { items, deliveryAddress, deliveryLatitude, deliveryLongitude, notes } = data;

    // 1. Pre-calculate total
    const totalAmount = items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);

    // 2. Reserve Inventory First (Atomic)
    const reservation = await reservationService.reserveInventory(tenantId, items);

    // 3. Create Order & Items in DB
    const order = await prisma.onlineOrder.create({
      data: {
        tenantId,
        patientId,
        orderNumber: `ORD-${Date.now()}`,
        orderStatus: ORDER_STATUS.PENDING,
        totalAmount,
        deliveryAddress,
        deliveryLatitude,
        deliveryLongitude,
        notes,
        orderItems: {
          create: items.map((item) => ({
            tenantId,
            medicineId: item.medicineId,
            batchId: reservation.reservedBatches.find((rb) => rb.medicineId === item.medicineId)
              ?.batchId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            totalPrice: item.unitPrice * item.quantity,
          })),
        },
      },
      include: { orderItems: true },
    });

    return order;
  }

  /**
   * Updates order status with strict state machine validation.
   */
  async updateOrderStatus(orderId, tenantId, newStatus) {
    const order = await prisma.onlineOrder.findFirst({
      where: { id: orderId, tenantId },
      include: { orderItems: true },
    });

    if (!order) throw new Error('Order not found');

    const allowed = VALID_TRANSITIONS[order.orderStatus] || [];
    if (!allowed.includes(newStatus)) {
      throw new Error(`Invalid state transition: ${order.orderStatus} -> ${newStatus}`);
    }

    // Workflow Actions
    if (newStatus === ORDER_STATUS.CANCELLED) {
      if (
        order.orderStatus === ORDER_STATUS.PENDING ||
        order.orderStatus === ORDER_STATUS.CONFIRMED
      ) {
        // Release reservation (increment reservedQuantity is not needed here as it was just a lock,
        // wait, releaseReservation decrements reservedQuantity)
        const itemsToRelease = order.orderItems.map((oi) => ({
          batchId: oi.batchId,
          quantity: oi.quantity,
        }));
        await reservationService.releaseReservation(tenantId, itemsToRelease);
      } else {
        // If already packed/shipped, we need to add back to quantity
        const itemsToReturn = order.orderItems.map((oi) => ({
          batchId: oi.batchId,
          quantity: oi.quantity,
        }));
        await reservationService.returnToStock(tenantId, itemsToReturn);
      }
    }

    if (newStatus === ORDER_STATUS.RETURNED) {
      const itemsToReturn = order.orderItems.map((oi) => ({
        batchId: oi.batchId,
        quantity: oi.quantity,
      }));
      await reservationService.returnToStock(tenantId, itemsToReturn);
    }

    if (newStatus === ORDER_STATUS.PACKING) {
      // Optional: Commit inventory (deduct quantity)
      const itemsToCommit = order.orderItems.map((oi) => ({
        batchId: oi.batchId,
        quantity: oi.quantity,
      }));
      await reservationService.commitReservation(tenantId, itemsToCommit);
    }

    if (newStatus === ORDER_STATUS.READY_FOR_PICKUP) {
      // Trigger logistics flow
      await dispatchService.handleOrderReady(tenantId, orderId);
    }

    const updatedOrder = await prisma.onlineOrder.update({
      where: { id: orderId },
      data: { orderStatus: newStatus },
    });

    logger.info(`[OrderService] Order ${orderId} transitioned to ${newStatus}`);
    return updatedOrder;
  }
}

export default new OrderService();
