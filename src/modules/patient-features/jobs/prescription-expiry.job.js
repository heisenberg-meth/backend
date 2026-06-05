import prisma from '../../../config/prisma.js';
import { emitEvent } from '../../../shared/events/erp-event-bus.js';
import logger from '../../../shared/utils/logger.js';

export async function processPrescriptionExpiryCheck() {
  logger.info('[PATIENT] Starting prescription expiry check...');
  const tenants = await prisma.tenant.findMany({ where: { deletedAt: null } });
  const now = new Date();

  for (const tenant of tenants) {
    const prescriptions = await prisma.prescription.findMany({
      where: {
        tenantId: tenant.id,
        deletedAt: null,
      },
      include: {
        items: { select: { durationDays: true } },
        patient: { select: { id: true, fullName: true, phone: true } },
      },
    });

    for (const p of prescriptions) {
      const maxDuration = Math.max(0, ...p.items.map((i) => i.durationDays || 0));
      if (maxDuration === 0) continue;

      const expiryDate = new Date(p.prescriptionDate);
      expiryDate.setDate(expiryDate.getDate() + maxDuration);

      const daysUntilExpiry = Math.round((expiryDate.getTime() - now.getTime()) / 86400000);

      if (daysUntilExpiry === 0) {
        await emitEvent('PRESCRIPTION_EXPIRED', {
          prescriptionId: p.id,
          patientId: p.patientId,
          tenantId: tenant.id,
          doctorName: p.doctorName,
          expiredAt: expiryDate,
        });

        if (p.patient.phone) {
          await prisma.smsNotification.create({
            data: {
              tenantId: tenant.id,
              patientId: p.patientId,
              phone: p.patient.phone,
              message: `Hi ${p.patient.fullName}, your prescription issued on ${p.prescriptionDate.toLocaleDateString()} has expired. Please consult your doctor for a new prescription.`,
              type: 'PRESCRIPTION_EXPIRY',
              status: 'PENDING',
            },
          });
        }
      }
    }
  }
  logger.info('[PATIENT] Prescription expiry check complete');
}
