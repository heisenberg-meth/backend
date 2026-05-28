import repo from '../repositories/refill.repository.js';
import prisma from '../../../config/prisma.js';
import { emitEvent } from '../../../shared/events/erp-event-bus.js';
import logger from '../../../shared/utils/logger.js';

class RefillService {
  /**
   * Predict next refill date based on purchase history
   */
  async predictRefill(patientId, medicineId, tenantId) {
    // Get last few sales for this medicine
    const sales = await prisma.sale.findMany({
      where: {
        patientId: patientId,
        tenantId,
        status: 'COMPLETED',
        items: { some: { medicineId } },
      },
      include: {
        items: {
          where: { medicineId },
          select: { quantity: true },
        },
      },
      orderBy: { soldAt: 'desc' },
      take: 5,
    });

    if (sales.length === 0) return null;

    const lastSale = sales[0];
    const lastPurchaseDate = lastSale.soldAt;
    const lastQuantity = lastSale.items[0].quantity;

    // Calculate daily consumption
    let dailyConsumption = 1; // Default
    if (sales.length >= 2) {
      const intervals = [];
      for (let i = 0; i < sales.length - 1; i++) {
        const diff = (sales[i].soldAt - sales[i + 1].soldAt) / (1000 * 60 * 60 * 24);
        if (diff > 0) {
          const qty = sales[i + 1].items[0].quantity;
          intervals.push(qty / diff);
        }
      }
      if (intervals.length > 0) {
        dailyConsumption = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      }
    }

    const daysUntilDepletion = Math.floor(lastQuantity / dailyConsumption);
    const expectedRefillAt = new Date(lastPurchaseDate);
    expectedRefillAt.setDate(expectedRefillAt.getDate() + daysUntilDepletion);

    const record = await repo.upsertRefillPrediction(tenantId, patientId, medicineId, {
      lastPurchaseDate,
      expectedRefillAt,
      dailyConsumption,
    });

    return record;
  }

  /**
   * Calculate adherence score and status
   */
  async calculateAdherence(patientId, medicineId, tenantId) {
    const refill = await prisma.patientRefill.findUnique({
      where: { tenantId_patientId_medicineId: { tenantId, patientId, medicineId } },
      include: {
        patient: { select: { fullName: true } },
        medicine: { select: { fullName: true } }
      }
    });

    if (!refill || !refill.expectedRefillAt) return null;

    const now = new Date();
    const diffDays = Math.floor((now - refill.expectedRefillAt) / (1000 * 60 * 60 * 24));
    
    let status = 'ON_TRACK';
    let score = 100;

    if (diffDays > 14) {
      status = 'CRITICAL';
      score = 30;
    } else if (diffDays > 7) {
      status = 'MISSED';
      score = 50;
    } else if (diffDays > 3) {
      status = 'AT_RISK';
      score = 75;
    } else if (diffDays < 0) {
      status = 'ON_TRACK';
      score = 100;
    }

    await prisma.patientRefill.update({
      where: { id: refill.id },
      data: { adherenceStatus: status }
    });

    await repo.createAdherenceLog({
      tenantId,
      patientId,
      medicineId,
      refillId: refill.id,
      adherenceScore: score,
      adherenceStatus: status,
    });

    if (status === 'CRITICAL' || status === 'MISSED') {
      await emitEvent('PATIENT_ADHERENCE_RISK', {
        patientId,
        medicineId,
        tenantId,
        status,
        score
      });

      if (status === 'CRITICAL') {
        // Escalation to Pharmacist
        await emitEvent('SEND_NOTIFICATION', {
          tenantId,
          recipient: 'BRANCH_PHARMACIST',
          channel: 'IN_APP',
          message: `CRITICAL ADHERENCE RISK: Patient ${refill.patient.fullName} has missed refill for ${refill.medicine.name} by more than 14 days. Immediate follow-up required.`,
          type: 'ADHERENCE_ESCALATION',
          priority: 'HIGH'
        });
      }
    }

    return { status, score };
  }

  /**
   * Trigger refill reminders for upcoming refills
   */
  async processUpcomingReminders(tenantId) {
    const upcoming = await repo.findUpcomingRefills(tenantId, 3); // 3 days ahead

    for (const refill of upcoming) {
      let type = 'REFILL_DUE';
      if (refill.adherenceStatus === 'AT_RISK') type = 'REFILL_DUE';
      else if (refill.adherenceStatus === 'MISSED') type = 'REFILL_OVERDUE';
      else if (refill.adherenceStatus === 'CRITICAL') type = 'REFILL_OVERDUE';

      // Logic to decide channel based on patient preference (mocked for now)
      const channel = 'WHATSAPP'; 
      
      await this.sendReminder(refill, channel, type);
    }
  }

  async sendReminder(refill, channel, type = 'REFILL_DUE') {
    const { patient, medicine, tenantId } = refill;
    
    // Create record
    const reminder = await repo.createReminder({
      tenantId,
      patientId: refill.patientId,
      medicineId: refill.medicineId,
      refillId: refill.id,
      reminderType: type,
      scheduledAt: new Date(),
      channel,
      deliveryStatus: 'PENDING'
    });

    try {
      // Template Engine
      const templates = {
        'REFILL_DUE': `Hello ${patient.fullName}, your refill for ${medicine.name} is due on ${refill.expectedRefillAt.toLocaleDateString()}. Please contact the pharmacy to ensure continuity of your treatment.`,
        'REFILL_OVERDUE': `URGENT: ${patient.fullName}, your refill for ${medicine.name} was due on ${refill.expectedRefillAt.toLocaleDateString()}. Missing doses can impact your health. Please visit us immediately.`,
        'PRESCRIPTION_EXPIRING': `Hello ${patient.fullName}, your prescription for ${medicine.name} is expiring soon. Please consult your doctor for a new prescription to continue your medication.`
      };

      const message = templates[reminder.reminderType] || templates['REFILL_DUE'];
      
      // Emit event for notification module to pick up
      await emitEvent('SEND_NOTIFICATION', {
        tenantId,
        recipient: patient.phone || patient.email,
        channel,
        message,
        type: 'REFILL_REMINDER',
        referenceId: reminder.id
      });

      await repo.updateReminderStatus(reminder.id, {
        deliveryStatus: 'SENT',
        sentAt: new Date()
      });

      await prisma.patientRefill.update({
        where: { id: refill.id },
        data: { 
          lastReminderSent: new Date(),
          reminderChannel: channel
        }
      });

    } catch (error) {
      logger.error({ error, reminderId: reminder.id }, 'Failed to send refill reminder');
      await repo.updateReminderStatus(reminder.id, {
        deliveryStatus: 'FAILED',
        errorMessage: error.message
      });
    }
  }

  async getUpcomingRefills(tenantId) {
    return repo.findUpcomingRefills(tenantId);
  }

  async getAdherenceSummary(patientId, tenantId) {
    return repo.findAdherenceSummary(patientId, tenantId);
  }

  async getReminderHistory(patientId, tenantId) {
    return repo.findRemindersByPatient(patientId, tenantId);
  }
}

export default new RefillService();
