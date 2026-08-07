import prisma from '../../../config/prisma.js';
import logger from '../../../shared/utils/logger.js';
import { notificationQueue } from '../../notifications/queue/notification.queue.js';

class ReminderService {
  /**
   * Automatically calculates and schedules a refill reminder after a purchase.
   * Target is Chronic medicines (Diabetes, Cardiac, Thyroid, BP, etc.)
   */
  async scheduleRefillReminder(tenantId, patientId, medicineId, purchaseDate, durationDays) {
    const medicine = await prisma.medicine.findFirst({
      where: { id: medicineId, tenantId },
      include: { category: true },
    });

    if (!medicine || !medicine.category) return;

    const chronicKeywords = ['diabetes', 'cardiac', 'thyroid', 'bp', 'blood pressure'];
    const isChronic = chronicKeywords.some((kw) =>
      medicine.category.name.toLowerCase().includes(kw),
    );

    if (isChronic && durationDays > 0) {
      const refillDate = new Date(purchaseDate);
      refillDate.setDate(refillDate.getDate() + durationDays - 3);

      await prisma.patientReminder.create({
        data: {
          tenantId,
          patientId,
          medicineId,
          reminderType: 'REFILL',
          nextReminderAt: refillDate,
          reminderChannel: 'SMS',
        },
      });
      logger.info(
        `[ReminderService] Scheduled refill reminder for patient ${patientId} on ${refillDate}`,
      );
    }
  }

  /**
   * Job to process pending reminders that are due today.
   */
  async processDueReminders() {
    logger.info('[ReminderService] Processing due reminders');
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    const dueReminders = await prisma.patientReminder.findMany({
      where: {
        status: 'PENDING',
        nextReminderAt: { lte: endOfDay },
      },
      include: {
        patient: true,
        medicine: true,
      },
    });

    for (const reminder of dueReminders) {
      if (!reminder.patient.phone) {
        await prisma.patientReminder.update({
          where: { id: reminder.id },
          data: { status: 'FAILED' },
        });
        continue;
      }

      await notificationQueue.add('send-sms', {
        tenantId: reminder.tenantId,
        recipient: reminder.patient.phone,
        message: `Hi ${reminder.patient.fullName}, it's time to refill your ${reminder.medicine.name}. Reply YES to automate your next delivery.`,
        subject: 'Medicine Refill Reminder',
        notificationId: `crm-reminder-${reminder.id}`,
      });

      await prisma.patientReminder.update({
        where: { id: reminder.id },
        data: { status: 'SENT' },
      });
    }

    logger.info(`[ReminderService] Processed ${dueReminders.length} due reminders.`);
  }
}

export default new ReminderService();
