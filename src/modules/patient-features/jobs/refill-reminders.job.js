import prisma from '../../../config/prisma.js';
import { emitEvent } from '../../../shared/events/erp-event-bus.js';
import logger from '../../../shared/utils/logger.js';

export async function processRefillReminders() {
  logger.info('[PATIENT] Starting refill reminder scan...');
  const tenants = await prisma.tenant.findMany({ where: { deletedAt: null } });

  for (const tenant of tenants) {
    const dueRefills = await prisma.patientRefill.findMany({
      where: {
        tenantId: tenant.id,
        expectedRefillAt: {
          gte: new Date(),
          lte: new Date(Date.now() + 3 * 86400000),
        },
        adherenceStatus: { in: ['ON_TRACK', 'AT_RISK'] },
      },
      include: {
        patient: { select: { id: true, fullName: true, phone: true } },
        medicine: { select: { id: true, fullName: true } },
      },
    });

    for (const refill of dueRefills) {
      const daysUntilDue = Math.round(
        (refill.expectedRefillAt.getTime() - Date.now()) / 86400000,
      );

      const message = `Hi ${refill.patient.fullName}, your ${refill.medicine.name} refill is due in ${daysUntilDue} day(s). Please visit us.`;

      await prisma.smsNotification.create({
        data: {
          tenantId: tenant.id,
          patientId: refill.patientId,
          phone: refill.patient.phone || '',
          message,
          type: 'REFILL_REMINDER',
          status: 'PENDING',
        },
      });

      await prisma.patientRefill.update({
        where: { id: refill.id },
        data: { lastReminderSent: new Date(), reminderChannel: 'SMS' },
      });

      await emitEvent('PATIENT_REFILL_DUE', {
        patientId: refill.patientId,
        medicineId: refill.medicineId,
        tenantId: tenant.id,
        expectedRefillAt: refill.expectedRefillAt,
        daysUntilDue,
      });
    }
  }
  logger.info('[PATIENT] Refill reminder scan complete');
}
