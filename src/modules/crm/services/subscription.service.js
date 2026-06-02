import prisma from '../../../config/prisma.js';
import logger from '../../../shared/utils/logger.js';
import { notificationQueue } from '../../notifications/queue/notification.queue.js';

class SubscriptionService {
  async processDueSubscriptions() {
    logger.info('[SubscriptionService] Processing due subscriptions');

    const lookaheadDate = new Date();
    lookaheadDate.setDate(lookaheadDate.getDate() + 2);
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
      const newDeliveryDate = new Date(sub.nextDeliveryDate);
      newDeliveryDate.setDate(newDeliveryDate.getDate() + sub.frequencyDays);

      await notificationQueue.add('send-sms', {
        tenantId: sub.tenantId,
        recipient: sub.patient.phone,
        message: `Hi ${sub.patient.fullName}, your scheduled refill of ${sub.quantity}x ${sub.medicine.name} is being processed. It will be ready on ${sub.nextDeliveryDate.toLocaleDateString()}.`,
        subject: 'Subscription Refill Initiated',
        notificationId: `sub-patient-${sub.id}`,
      });

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
        autoBilling,
      },
    });
  }
}

export default new SubscriptionService();
