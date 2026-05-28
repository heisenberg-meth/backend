import prisma from '../../../config/prisma.js';
import logger from '../../../shared/utils/logger.js';
import { emitLocalEvent } from '../../../shared/events/local-event-bus.js';
import { EVENTS } from '../../../shared/constants/events.js';
import prescriptionRepository from '../repositories/prescription.repository.js';

class PrescriptionService {
  async createPrescription(tenantId, data, userId) {
    const { patientId, doctorId, doctorName, prescriptionDate, notes, items } = data;

    const count = await prisma.prescription.count({ where: { tenantId } });
    const seq = String(count + 1).padStart(5, '0');
    const prescriptionNumber = `RX-${new Date().getFullYear()}-${seq}`;

    const prescription = await prescriptionRepository.createPrescription(
      {
        tenantId,
        patientId,
        doctorId: doctorId || undefined,
        doctorName: doctorName || undefined,
        prescriptionDate: new Date(prescriptionDate),
        prescriptionNumber,
        notes,
        status: 'ACTIVE',
        verificationStatus: 'PENDING',
        createdBy: userId,
      },
      items.map((item) => ({
        medicineId: item.medicineId,
        dosage: item.dosage,
        frequency: item.frequency,
        durationDays: item.durationDays,
        quantity: item.quantity || 0,
        dispensedQuantity: 0,
        refillEligible: item.refillEligible !== false,
        instructions: item.instructions,
      })),
    );

    logger.info(`[Prescription] Created ${prescriptionNumber} for patient ${patientId}`);

    emitLocalEvent(EVENTS.PRESCRIPTION_CREATED, {
      prescriptionId: prescription.id,
      prescriptionNumber,
      patientId,
      tenantId,
      timestamp: new Date().toISOString(),
    });

    return prescription;
  }

  async verifyPrescription(prescriptionId, userId, status, rejectionReason) {
    const prescription = await prescriptionRepository.findPrescriptionById(prescriptionId);
    if (!prescription) throw new Error('Prescription not found');

    if (prescription.verificationStatus !== 'PENDING') {
      throw new Error(`Prescription already ${prescription.verificationStatus}`);
    }

    const result = await prisma.$transaction(async (tx) => {
      const updated = await prescriptionRepository.updatePrescription(prescriptionId, {
        verificationStatus: status,
        verifiedBy: userId,
        verifiedAt: new Date(),
        status: status === 'VERIFIED' ? 'VERIFIED' : 'ACTIVE',
      }, tx);

      await prescriptionRepository.createVerification({
        prescriptionId,
        verifiedBy: userId,
        status,
        rejectionReason: status === 'REJECTED' ? rejectionReason : null,
      }, tx);

      return updated;
    });

    const event = status === 'VERIFIED' ? EVENTS.PRESCRIPTION_VERIFIED : EVENTS.PRESCRIPTION_REJECTED;
    emitLocalEvent(event, {
      prescriptionId,
      verifiedBy: userId,
      rejectionReason,
      timestamp: new Date().toISOString(),
    });

    logger.info(`[Prescription] ${prescriptionId} verification: ${status}`);
    return result;
  }

  async convertToInvoice(prescriptionId) {
    const prescription = await prescriptionRepository.findPrescriptionById(prescriptionId);
    if (!prescription) throw new Error('Prescription not found');

    if (prescription.verificationStatus !== 'VERIFIED') {
      throw new Error('Prescription must be verified before conversion');
    }

    if (prescription.status === 'DISPENSED' || prescription.status === 'PARTIALLY_DISPENSED') {
      const allFullyDispensed = prescription.items.every(
        (i) => (i.dispensedQuantity || 0) >= i.quantity,
      );
      if (allFullyDispensed) throw new Error('Prescription fully dispensed');
    }

    return {
      prescriptionId: prescription.id,
      prescriptionNumber: prescription.prescriptionNumber,
      patientId: prescription.patientId,
      items: prescription.items.map((item) => ({
        medicineId: item.medicineId,
        medicineName: item.medicine?.name,
        dosage: item.dosage,
        quantity: item.quantity - (item.dispensedQuantity || 0),
        dispensedQuantity: item.dispensedQuantity || 0,
        remainingQuantity: item.quantity - (item.dispensedQuantity || 0),
        instructions: item.instructions,
      })),
      readyForBilling: true,
    };
  }

  async updatePrescription(prescriptionId, data) {
    const prescription = await prescriptionRepository.findPrescriptionById(prescriptionId);
    if (!prescription) throw new Error('Prescription not found');

    const ALLOWED_FIELDS = ['pharmacistNotes', 'notes'];
    const updateData = {};
    for (const key of Object.keys(data)) {
      if (ALLOWED_FIELDS.includes(key)) {
        updateData[key] = data[key];
      }
    }

    if (Object.keys(updateData).length === 0) {
      throw new Error('No editable fields provided. Only notes and pharmacistNotes are editable.');
    }

    return prescriptionRepository.updatePrescription(prescriptionId, updateData);
  }

  async archivePrescription(prescriptionId) {
    const prescription = await prescriptionRepository.findPrescriptionById(prescriptionId);
    if (!prescription) throw new Error('Prescription not found');

    const result = await prescriptionRepository.softDeletePrescription(prescriptionId);

    emitLocalEvent(EVENTS.PRESCRIPTION_ARCHIVED, {
      prescriptionId,
      timestamp: new Date().toISOString(),
    });

    return result;
  }

  async checkExpiry() {
    const now = new Date();
    const expired = await prisma.prescription.findMany({
      where: {
        status: { in: ['ACTIVE', 'VERIFIED'] },
        prescriptionDate: {
          lt: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
        },
        deletedAt: null,
      },
      select: { id: true, prescriptionNumber: true },
    });

    for (const p of expired) {
      await prisma.prescription.update({
        where: { id: p.id },
        data: { status: 'EXPIRED' },
      });

      emitLocalEvent(EVENTS.PRESCRIPTION_EXPIRED, {
        prescriptionId: p.id,
        prescriptionNumber: p.prescriptionNumber,
        timestamp: new Date().toISOString(),
      });
    }

    if (expired.length > 0) {
      logger.info(`[Prescription] Expired ${expired.length} prescriptions`);
    }

    return expired;
  }

  async validatePrescription(prescriptionId, tenantId) {
    const prescription = await prescriptionRepository.findById(prescriptionId);
    if (!prescription) {
      throw new Error('Prescription not found');
    }

    if (prescription.verificationStatus !== 'VERIFIED') {
      throw new Error(`Prescription status is ${prescription.verificationStatus}, not VERIFIED`);
    }

    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    if (new Date(prescription.prescriptionDate) < sixMonthsAgo) {
      await prescriptionRepository.updateStatus(prescriptionId, tenantId, 'EXPIRED');
      throw new Error('Prescription has expired');
    }

    return true;
  }
}

export default new PrescriptionService();
