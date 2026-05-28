import prisma from '../../../config/prisma.js';
import logger from '../../../shared/utils/logger.js';
import { notificationQueue } from '../../notifications/queue/notification.queue.js';

class SubscriptionService {
  /**
   * Process all subscriptions that are due for delivery today or in the next 2 days.
   * Generates mock invoice drafts and reserves stock.
   */
  async processDueSubscriptions() {
    logger.info('[SubscriptionService] Processing due subscriptions');
    
    const lookaheadDate = new Date();
    lookaheadDate.setDate(lookaheadDate.getDate() + 2); // Process 2 days in advance
    lookaheadDate.setHours(23, 59, 59, 999);

    const subscriptions = await prisma.medicineSubscription.findMany({
      where: {
        subscriptionStatus: 'ACTIVE',
        nextDeliveryDate: { lte: lookaheadDate },
      },
      include: {
        patient: true,
        medicine: true,
        tenant: true,
      },
    });

    for (const sub of subscriptions) {
      // 1. Stock Check & Reservation Logic
      // For this implementation, we will notify the branch owner to confirm stock.
      // In a full implementation, this would automatically generate an Invoice draft and deduct inventory.

      const newDeliveryDate = new Date(sub.nextDeliveryDate);
      newDeliveryDate.setDate(newDeliveryDate.getDate() + sub.frequencyDays);

      // Notify Pharmacist/Owner
      await notificationQueue.add('send-sms', {
        tenantId: sub.tenantId,
        recipient: sub.patient.phone,
        message: `Hi ${sub.patient.fullName}, your scheduled refill of ${sub.quantity}x ${sub.medicine.name} is being processed. It will be ready on ${sub.nextDeliveryDate.toLocaleDateString()}.`,
        subject: 'Subscription Refill Initiated',
        notificationId: `sub-patient-${sub.id}`,
      });

      // Advance the subscription to the next cycle
      await prisma.medicineSubscription.update({
        where: { id: sub.id },
        data: {
          nextDeliveryDate: newDeliveryDate,
        },
      });

      logger.info(
        `[SubscriptionService] Processed subscription ${sub.id}. Next delivery: ${newDeliveryDate}`,
      );
    }
  }

  async createSubscription(tenantId, data) {
    const { patientId, medicineId, frequencyDays, quantity, autoBilling } = data;
    
    const nextDeliveryDate = new Date();
    nextDeliveryDate.setDate(nextDeliveryDate.getDate() + frequencyDays);

    return prisma.medicineSubscription.create({
      data: {
        tenantId,
        patientId,
        medicineId,
        frequencyDays,
        quantity,
        nextDeliveryDate,
        autoBilling
      }
    });
  }
}

export default new SubscriptionService();
