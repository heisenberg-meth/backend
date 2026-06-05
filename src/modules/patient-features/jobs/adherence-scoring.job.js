import prisma from '../../../config/prisma.js';
import { emitEvent } from '../../../shared/events/erp-event-bus.js';
import logger from '../../../shared/utils/logger.js';

export async function processAdherenceScoring() {
  logger.info('[PATIENT] Starting adherence scoring...');
  const tenants = await prisma.tenant.findMany({ where: { deletedAt: null } });
  const now = new Date();

  for (const tenant of tenants) {
    const refills = await prisma.patientRefill.findMany({
      where: { tenantId: tenant.id },
      include: {
        patient: { select: { id: true, fullName: true } },
        medicine: { select: { id: true, fullName: true } },
      },
    });

    for (const refill of refills) {
      if (!refill.expectedRefillAt) continue;

      const daysOverdue = Math.round(
        (now.getTime() - refill.expectedRefillAt.getTime()) / 86400000,
      );
      let newStatus = refill.adherenceStatus;

      if (daysOverdue > 14) newStatus = 'CRITICAL';
      else if (daysOverdue > 7) newStatus = 'MISSED';
      else if (daysOverdue > 3) newStatus = 'AT_RISK';
      else newStatus = 'ON_TRACK';

      if (newStatus !== refill.adherenceStatus) {
        await prisma.patientRefill.update({
          where: { id: refill.id },
          data: { adherenceStatus: newStatus },
        });

        if (newStatus === 'CRITICAL' || newStatus === 'MISSED') {
          await emitEvent('ADHERENCE_RISK_DETECTED', {
            patientId: refill.patientId,
            medicineId: refill.medicineId,
            tenantId: tenant.id,
            adherenceStatus: newStatus,
            daysOverdue,
          });
        }
      }
    }
  }
  logger.info('[PATIENT] Adherence scoring complete');
}
