import logger from '../../../shared/utils/logger.js';
import { emitLocalEvent } from '../../../shared/events/local-event-bus.js';
import { EVENTS } from '../../../shared/constants/events.js';
import prescriptionRepository from '../repositories/prescription.repository.js';

class RefillService {
  async getRefillEligibility(prescriptionId) {
    const prescription = await prescriptionRepository.getRefills(prescriptionId);
    if (!prescription) throw new Error('Prescription not found');

    const remainingRefills = prescription.refillMax - prescription.refillCount;

    const items = (prescription.items || []).map((item) => {
      const canRefill = item.refillEligible !== false && remainingRefills > 0;
      return {
        medicineId: item.medicineId,
        medicineName: item.medicine?.name,
        refillEligible: canRefill,
        remainingRefills,
      };
    });

    return {
      prescriptionId: prescription.id,
      refillCount: prescription.refillCount,
      refillMax: prescription.refillMax,
      remainingRefills: Math.max(0, remainingRefills),
      items,
      canRefill: remainingRefills > 0 && items.some((i) => i.refillEligible),
    };
  }

  async processRefill(prescriptionId, tenantId) {
    const eligibility = await this.getRefillEligibility(prescriptionId);
    if (!eligibility.canRefill) {
      throw new Error('No refills remaining for this prescription');
    }

    const updated = await prescriptionRepository.updatePrescription(prescriptionId, {
      refillCount: { increment: 1 },
    });

    await prescriptionRepository.createRefillReminder({
      tenantId,
      patientId: eligibility.prescriptionId,
      medicineId: eligibility.items[0]?.medicineId || '',
      reminderType: 'REFILL',
      nextReminderAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      reminderChannel: 'SMS',
    });

    emitLocalEvent(EVENTS.REFILL_PROCESSED, {
      prescriptionId,
      refillCount: updated.refillCount,
      timestamp: new Date().toISOString(),
    });

    logger.info(`[Refill] Processed refill for prescription ${prescriptionId}, refill #${updated.refillCount}`);

    return {
      ...eligibility,
      refillCount: updated.refillCount,
      refillProcessed: true,
    };
  }

  async checkDueRefills(tenantId) {
    const prescriptions = await prescriptionRepository.findPrescriptions(tenantId, {
      status: 'VERIFIED',
      limit: 100,
    });

    const dueRefills = prescriptions.data.filter((p) => {
      const daysSincePrescription = (Date.now() - new Date(p.prescriptionDate).getTime()) / (1000 * 60 * 60 * 24);
      return daysSincePrescription > 25;
    });

    for (const p of dueRefills) {
      emitLocalEvent(EVENTS.REFILL_DUE, {
        prescriptionId: p.id,
        patientId: p.patientId,
        timestamp: new Date().toISOString(),
      });
    }

    return dueRefills.map((p) => ({ id: p.id, patientId: p.patientId }));
  }
}

export default new RefillService();
