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
      include: { category: true }
    });

    if (!medicine || !medicine.category) return;

    const chronicKeywords = ['diabetes', 'cardiac', 'thyroid', 'bp', 'blood pressure'];
    const isChronic = chronicKeywords.some(kw => medicine.category.name.toLowerCase().includes(kw));

    if (isChronic && durationDays > 0) {
      const refillDate = new Date(purchaseDate);
      refillDate.setDate(refillDate.getDate() + durationDays - 3); // 3 days before they run out

      // Upsert to avoid duplicate reminders for the same medicine cycle
      await prisma.medicineReminder.create({
        data: {
          tenantId,
          patientId,
          medicineId,
          reminderType: 'REFILL',
          nextReminderAt: refillDate,
          reminderChannel: 'SMS', // Default channel
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

    const dueReminders = await prisma.medicineReminder.findMany({
      where: {
        status: 'PENDING',
        nextReminderAt: { lte: endOfDay }
      },
      include: {
        patient: true,
        medicine: true
      }
    });

    for (const reminder of dueReminders) {
      if (!reminder.patient.phone) {
        await prisma.medicineReminder.update({
          where: { id: reminder.id },
          data: { status: 'FAILED' }
        });
        continue;
      }

      // Dispatch to Notification System
      await notificationQueue.add('send-sms', {
        tenantId: reminder.tenantId,
        recipient: reminder.patient.phone,
        message: `Hi ${reminder.patient.fullName}, it's time to refill your ${reminder.medicine.name}. Reply YES to automate your next delivery.`,
        subject: 'Medicine Refill Reminder',
        notificationId: `crm-reminder-${reminder.id}` // Temporary ref for the generic notification system
      });

      // Update local status
      await prisma.medicineReminder.update({
        where: { id: reminder.id },
        data: { status: 'SENT' }
      });
    }

    logger.info(`[ReminderService] Processed ${dueReminders.length} due reminders.`);
  }
}

export default new ReminderService();
