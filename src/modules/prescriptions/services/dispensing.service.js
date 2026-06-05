import logger from '../../../shared/utils/logger.js';
import { emitLocalEvent } from '../../../shared/events/local-event-bus.js';
import { EVENTS } from '../../../shared/constants/events.js';
import prescriptionRepository from '../repositories/prescription.repository.js';
import complianceService from './compliance.service.js';

class PrescriptionDispensingService {
  async getDispensingHistory(prescriptionId) {
    const prescription = await prescriptionRepository.findPrescriptionById(prescriptionId);
    if (!prescription) throw new Error('Prescription not found');

    const invoices = await prescriptionRepository.getDispensingHistory(prescriptionId);

    return {
      prescriptionId: prescription.id,
      prescriptionNumber: prescription.prescriptionNumber,
      totalItems: prescription.items.length,
      items: prescription.items.map((item) => {
        const dispensedInInvoices = [];
        for (const inv of invoices) {
          const match = inv.items.find((i) => i.medicineId === item.medicineId);
          if (match) {
            dispensedInInvoices.push({
              invoiceNumber: inv.invoiceNumber,
              quantity: match.quantity,
              dispensedAt: inv.createdAt,
            });
          }
        }

        return {
          medicineId: item.medicineId,
          medicineName: item.medicine?.name,
          prescribedQuantity: item.quantity,
          dispensedQuantity: item.dispensedQuantity || 0,
          remainingQuantity: item.quantity - (item.dispensedQuantity || 0),
          dispensedInInvoices,
        };
      }),
      invoiceCount: invoices.length,
    };
  }

  async checkDispensingEligibility(prescriptionId) {
    const prescription = await prescriptionRepository.findPrescriptionById(prescriptionId);
    if (!prescription) throw new Error('Prescription not found');

    const compliance = await complianceService.validatePrescriptionForDispensing(prescription);
    if (!compliance.valid) {
      return { eligible: false, reason: compliance.reason, severity: compliance.severity };
    }

    const allFullyDispensed = prescription.items.every(
      (i) => (i.dispensedQuantity || 0) >= i.quantity,
    );
    if (allFullyDispensed) {
      return { eligible: false, reason: 'All items fully dispensed' };
    }

    return {
      eligible: true,
      prescriptionNumber: prescription.prescriptionNumber,
      items: prescription.items.map((i) => ({
        medicineId: i.medicineId,
        medicineName: i.medicine?.name,
        prescribedQuantity: i.quantity,
        alreadyDispensed: i.dispensedQuantity || 0,
        availableForDispensing: (i.quantity || 0) - (i.dispensedQuantity || 0),
      })),
    };
  }

  async recordDispensing(prescriptionId, dispensedItems) {
    const prescription = await prescriptionRepository.findPrescriptionById(prescriptionId);
    if (!prescription) throw new Error('Prescription not found');

    const allFullyDispensed = prescription.items.every((i) => {
      const dispensed = dispensedItems.find((d) => d.medicineId === i.medicineId);
      const alreadyDispensed = i.dispensedQuantity || 0;
      const newDispensed = alreadyDispensed + (dispensed?.quantity || 0);
      if (newDispensed > i.quantity) {
        throw new Error(
          `Dispensing ${dispensed?.quantity} exceeds prescribed quantity ${i.quantity} for ${i.medicine?.name || i.medicineId}`,
        );
      }
      return newDispensed >= i.quantity;
    });

    const anyPartiallyDispensed = prescription.items.some((i) => {
      const alreadyDispensed = i.dispensedQuantity || 0;
      return alreadyDispensed > 0;
    });

    let newStatus = 'PARTIALLY_DISPENSED';
    if (anyPartiallyDispensed && allFullyDispensed) {
      newStatus = 'DISPENSED';
    } else if (allFullyDispensed) {
      newStatus = 'DISPENSED';
    }

    await prescriptionRepository.updatePrescription(prescriptionId, { status: newStatus });

    const event =
      newStatus === 'DISPENSED'
        ? EVENTS.PRESCRIPTION_DISPENSED
        : EVENTS.PRESCRIPTION_PARTIALLY_DISPENSED;
    emitLocalEvent(event, {
      prescriptionId,
      itemsDispensed: dispensedItems.length,
      fullyDispensed: newStatus === 'DISPENSED',
      timestamp: new Date().toISOString(),
    });

    logger.info(`[Dispensing] Prescription ${prescriptionId} dispensing recorded (${newStatus})`);
  }
}

export default new PrescriptionDispensingService();
