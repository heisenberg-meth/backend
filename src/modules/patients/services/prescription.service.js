import prescriptionRepository from '../repositories/prescription.repository.js';
import prisma from '../../../config/prisma.js';
import notificationService from './notification.service.js';

class PrescriptionService {
  async createPrescription(tenantId, data, userId) {
    return prescriptionRepository.createPrescription({
      ...data,
      tenantId,
      createdBy: userId,
    });
  }

  async getCustomerPrescriptions(patientId, tenantId) {
    return prescriptionRepository.findByCustomerId(patientId, tenantId);
  }

  async getPrescriptionById(id, tenantId) {
    const prescription = await prescriptionRepository.findById(id, tenantId);
    if (!prescription) throw new Error('Prescription not found');
    return prescription;
  }

  /**
   * Scan prescriptions and send refill reminders
   */
  async processRefillReminders() {
    const tenants = await prisma.tenant.findMany({ where: { deletedAt: null } });
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + 3);

    for (const tenant of tenants) {
      const prescriptions = await prisma.prescription.findMany({
        where: { tenantId: tenant.id },
        include: { items: true, patient: true },
      });

      for (const p of prescriptions) {
        const maxDuration = Math.max(...p.items.map((i) => i.durationDays || 0));
        if (maxDuration === 0) continue;

        const refillDate = new Date(p.prescriptionDate);
        refillDate.setDate(refillDate.getDate() + maxDuration);

        if (refillDate.toDateString() === targetDate.toDateString()) {
          if (p.patient.phone) {
            await notificationService.sendSms(tenant.id, {
              patientId: p.patientId,
              phone: p.patient.phone,
              message: `Hi ${p.patient.fullName}, your medicines from prescription on ${p.prescriptionDate.toLocaleDateString()} are ending soon. Please visit us for a refill.`,
              type: 'REFILL_REMINDER',
            });
          }
        }
      }
    }
  }
}

export default new PrescriptionService();
