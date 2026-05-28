import prisma from '../../../config/prisma.js';
import { ADHERENCE_THRESHOLDS } from '../constants/templates.js';

class ReminderAnalyzerService {
  async analyzePatientRefills(patientId, tenantId) {
    const patient = await prisma.patient.findUnique({
      where: { id: patientId },
      select: {
        id: true, fullName: true, phone: true, email: true,
        allowSms: true, allowWhatsapp: true, allowEmail: true,
      },
    });
    if (!patient) throw new Error('Patient not found');

    const activePrescriptions = await prisma.prescription.findMany({
      where: {
        patientId,
        tenantId,
        status: { in: ['ACTIVE', 'VERIFIED'] },
        deletedAt: null,
      },
      include: {
        items: {
          include: { medicine: { select: { id: true, name: true, scheduleType: true } } },
        },
      },
    });

    const reminders = [];
    for (const prescription of activePrescriptions) {
      for (const item of prescription.items) {
        const refillPrediction = await prisma.patientRefill.findUnique({
          where: {
            tenantId_patientId_medicineId: { tenantId, patientId, medicineId: item.medicineId },
          },
        });

        const durationDays = item.durationDays || 30;
        const prescriptionEnd = new Date(prescription.prescriptionDate);
        prescriptionEnd.setDate(prescriptionEnd.getDate() + durationDays);

        const now = new Date();
        const daysUntilEnd = Math.ceil((prescriptionEnd - now) / (1000 * 60 * 60 * 24));
        const isScheduleH = item.medicine?.scheduleType === 'H' || item.medicine?.scheduleType === 'H1' || item.medicine?.scheduleType === 'X';

        let reminderType = null;
        let priority = 'LOW';

        if (refillPrediction?.expectedRefillAt) {
          const daysUntilRefill = Math.ceil((refillPrediction.expectedRefillAt - now) / (1000 * 60 * 60 * 24));
          if (daysUntilRefill <= 0) {
            reminderType = 'REFILL_OVERDUE';
            priority = 'HIGH';
          } else if (daysUntilRefill <= ADHERENCE_THRESHOLDS.REFILL_WINDOW_DAYS) {
            reminderType = 'REFILL_DUE';
            priority = 'MEDIUM';
          }
        } else if (daysUntilEnd <= ADHERENCE_THRESHOLDS.REFILL_WINDOW_DAYS && daysUntilEnd >= 0) {
          reminderType = 'REFILL_DUE';
          priority = 'MEDIUM';
        }

        if (isScheduleH && daysUntilEnd <= ADHERENCE_THRESHOLDS.SCHEDULE_H_EXPIRY_DAYS && daysUntilEnd >= 0) {
          reminderType = 'PRESCRIPTION_EXPIRING';
          priority = 'HIGH';
        }

        if (daysUntilEnd < 0) {
          const overdueDays = Math.abs(daysUntilEnd);
          if (overdueDays >= ADHERENCE_THRESHOLDS.CRITICAL_DAYS && isScheduleH) {
            reminderType = 'PRESCRIPTION_EXPIRED';
            priority = 'URGENT';
          } else if (overdueDays >= ADHERENCE_THRESHOLDS.OVERDUE_WARNING_DAYS) {
            reminderType = 'PRESCRIPTION_EXPIRED';
            priority = 'HIGH';
          } else {
            reminderType = 'PRESCRIPTION_EXPIRING';
            priority = 'MEDIUM';
          }
        }

        if (reminderType) {
          reminders.push({
            patientId,
            medicineId: item.medicineId,
            medicineName: item.medicine?.name,
            prescriptionId: prescription.id,
            reminderType,
            priority,
            prescriptionEnd,
            expectedRefillAt: refillPrediction?.expectedRefillAt || prescriptionEnd,
            isScheduleH,
            dosage: item.dosage,
            frequency: item.frequency,
            dailyConsumption: refillPrediction?.dailyConsumption || 1,
          });
        }
      }
    }

    return { patient, reminders };
  }

  async getRefillEligibility(patientId, medicineId, tenantId) {
    const refill = await prisma.patientRefill.findUnique({
      where: { tenantId_patientId_medicineId: { tenantId, patientId, medicineId } },
      include: { medicine: true },
    });
    if (!refill) return { eligible: false, reason: 'No refill prediction available' };

    const now = new Date();
    const daysOverdue = refill.expectedRefillAt
      ? Math.ceil((now - refill.expectedRefillAt) / (1000 * 60 * 60 * 24))
      : 0;

    if (refill.lastReminderSent) {
      const hoursSinceLastReminder = (now - refill.lastReminderSent) / (1000 * 60 * 60);
      if (hoursSinceLastReminder < 24) {
        return { eligible: false, reason: 'Reminder already sent within 24 hours', lastSent: refill.lastReminderSent };
      }
    }

    const recentPurchase = await prisma.sale.findFirst({
      where: {
        patientId, tenantId,
        status: 'COMPLETED',
        items: { some: { medicineId } },
      },
      orderBy: { soldAt: 'desc' },
    });

    if (recentPurchase) {
      const daysSincePurchase = Math.ceil((now - recentPurchase.soldAt) / (1000 * 60 * 60 * 24));
      if (daysSincePurchase < ADHERENCE_THRESHOLDS.REFILL_WINDOW_DAYS) {
        return { eligible: false, reason: 'Recently purchased' };
      }
    }

    return { eligible: true, daysOverdue, expectedRefillAt: refill.expectedRefillAt };
  }

  async getAdherenceFormula(patientId, medicineId, tenantId) {
    const prescriptions = await prisma.prescriptionItem.findMany({
      where: {
        prescription: { patientId, tenantId, deletedAt: null },
        medicineId,
      },
      include: { prescription: { select: { prescriptionDate: true } } },
    });

    const totalPrescribed = prescriptions.reduce((sum, item) => sum + (item.quantity || 0), 0);

    const sales = await prisma.sale.findMany({
      where: {
        patientId, tenantId, status: 'COMPLETED',
        items: { some: { medicineId } },
      },
      include: { items: { where: { medicineId }, select: { quantity: true } } },
      orderBy: { soldAt: 'desc' },
    });

    const totalRefilled = sales.reduce((sum, sale) => {
      return sum + sale.items.reduce((s, i) => s + (i.quantity || 0), 0);
    }, 0);

    const expectedRefills = prescriptions.length;
    const adherenceRate = expectedRefills > 0 ? totalRefilled / totalPrescribed : 0;

    return {
      adherenceRate: Math.min(adherenceRate, 1),
      totalPrescribed,
      totalRefilled,
      expectedRefills,
      collectedOnTime: sales.length,
    };
  }
}

export default new ReminderAnalyzerService();
