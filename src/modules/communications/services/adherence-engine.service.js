import prisma from '../../../config/prisma.js';
import logger from '../../../shared/utils/logger.js';
import { ADHERENCE_THRESHOLDS } from '../constants/templates.js';
import communicationQueue from '../queues/communication.queue.js';

class AdherenceEngineService {
  async scanRefillCandidates() {
    logger.info('[AdherenceEngine] Starting refill candidate scan...');
    const tenants = await prisma.tenant.findMany({
      where: { deletedAt: null },
      select: { id: true },
    });

    let totalJobs = 0;
    for (const tenant of tenants) {
      const count = await this.scanTenant(tenant.id);
      totalJobs += count;
    }

    logger.info({ totalJobs }, '[AdherenceEngine] Refill candidate scan complete');
    return { tenantsScanned: tenants.length, jobsQueued: totalJobs };
  }

  async scanTenant(tenantId) {
    const now = new Date();
    const windowEnd = new Date(now.getTime() + ADHERENCE_THRESHOLDS.REFILL_WINDOW_DAYS * 86400000);
    const overdueStart = new Date(now.getTime() - ADHERENCE_THRESHOLDS.CRITICAL_DAYS * 86400000);

    const candidates = await prisma.patientRefill.findMany({
      where: {
        tenantId,
        expectedRefillAt: { gte: overdueStart, lte: windowEnd },
        adherenceStatus: { not: 'CRITICAL' },
      },
      include: {
        patient: {
          select: {
            id: true,
            fullName: true,
            phone: true,
            email: true,
            allowSms: true,
            allowWhatsapp: true,
          },
        },
        medicine: { select: { id: true, name: true } },
      },
    });

    const prescriptionCandidates = await prisma.prescription.findMany({
      where: {
        tenantId,
        deletedAt: null,
        status: { in: ['ACTIVE', 'VERIFIED'] },
      },
      include: {
        patient: { select: { id: true, fullName: true, phone: true, email: true, allowSms: true, allowWhatsapp: true } },
        items: { include: { medicine: { select: { id: true, fullName: true, scheduleType: true } } } },
      },
    });

    let jobsQueued = 0;

    for (const refill of candidates) {
      const overdueDays = Math.ceil((now - refill.expectedRefillAt) / (1000 * 60 * 60 * 24));

      let reminderType = 'REFILL_DUE';
      if (overdueDays >= ADHERENCE_THRESHOLDS.CRITICAL_DAYS) {
        reminderType = 'REFILL_OVERDUE';
      } else if (overdueDays >= ADHERENCE_THRESHOLDS.OVERDUE_WARNING_DAYS) {
        reminderType = 'REFILL_OVERDUE';
      }

      if (refill.lastReminderSent) {
        const hoursSinceLast = (now - refill.lastReminderSent) / (1000 * 60 * 60);
        if (hoursSinceLast < 24) continue;
      }

      const recentPurchase = await prisma.sale.findFirst({
        where: {
          patientId: refill.patientId, tenantId, status: 'COMPLETED',
          items: { some: { medicineId: refill.medicineId } },
        },
        orderBy: { soldAt: 'desc' },
      });

      if (recentPurchase) {
        const daysSincePurchase = Math.ceil((now - recentPurchase.soldAt) / (1000 * 60 * 60 * 24));
        if (daysSincePurchase < ADHERENCE_THRESHOLDS.REFILL_WINDOW_DAYS) continue;
      }

      await communicationQueue.add('send-reminder', {
        tenantId,
        patientId: refill.patient.id,
        patientName: refill.patient.fullName,
        recipient: refill.patient.phone,
        channel: refill.patient.allowWhatsapp !== false ? 'WHATSAPP' : 'SMS',
        reminderType,
        medicineName: refill.medicine.name,
        medicineId: refill.medicine.id,
        isScheduleH: false,
        prescriptionEnd: refill.expectedRefillAt,
        expectedRefillAt: refill.expectedRefillAt,
        priority: overdueDays >= ADHERENCE_THRESHOLDS.CRITICAL_DAYS ? 'URGENT' : 'HIGH',
        scheduled: true,
      });

      jobsQueued++;
    }

    for (const prescription of prescriptionCandidates) {
      for (const item of prescription.items) {
        const durationDays = item.durationDays || 30;
        const prescriptionEnd = new Date(prescription.prescriptionDate);
        prescriptionEnd.setDate(prescriptionEnd.getDate() + durationDays);

        const daysUntilEnd = Math.ceil((prescriptionEnd - now) / (1000 * 60 * 60 * 24));

        if (daysUntilEnd > ADHERENCE_THRESHOLDS.REFILL_WINDOW_DAYS || daysUntilEnd < -ADHERENCE_THRESHOLDS.CRITICAL_DAYS) continue;

        const existingRefill = candidates.find(r => r.medicineId === item.medicineId);
        if (existingRefill) continue;

        const isScheduleH = item.medicine?.scheduleType === 'H' || item.medicine?.scheduleType === 'H1' || item.medicine?.scheduleType === 'X';

        let reminderType = 'PRESCRIPTION_EXPIRING';
        if (daysUntilEnd < 0) {
          reminderType = 'PRESCRIPTION_EXPIRED';
        }

        await communicationQueue.add('send-reminder', {
          tenantId,
          patientId: prescription.patient.id,
          patientName: prescription.patient.fullName,
          recipient: prescription.patient.phone,
          channel: prescription.patient.allowWhatsapp !== false ? 'WHATSAPP' : 'SMS',
          reminderType,
          medicineName: item.medicine?.name,
          medicineId: item.medicineId,
          isScheduleH,
          prescriptionEnd,
          priority: isScheduleH && daysUntilEnd < 0 ? 'URGENT' : 'MEDIUM',
          scheduled: true,
        });

        jobsQueued++;
      }
    }

    return jobsQueued;
  }

  async processAdherenceBatch(tenantId) {
    const critical = await prisma.patientRefill.findMany({
      where: {
        tenantId,
        adherenceStatus: { in: ['MISSED', 'CRITICAL'] },
      },
      include: {
        patient: { select: { id: true, fullName: true } },
        medicine: { select: { id: true, fullName: true } },
      },
    });

    for (const refill of critical) {
      await communicationQueue.add('adherence-escalation', {
        tenantId,
        patientId: refill.patient.id,
        patientName: refill.patient.fullName,
        medicineId: refill.medicine.id,
        medicineName: refill.medicine.name,
        adherenceStatus: refill.adherenceStatus,
      });
    }

    return { escalated: critical.length };
  }
}

export default new AdherenceEngineService();
