import prisma from '../../../config/prisma.js';
import { emitLocalEvent } from '../../../shared/events/local-event-bus.js';
import { DOMAIN_EVENTS } from '../../../shared/constants/events.js';

class PatientComplianceService {
  async checkAllergyInteractions(patientId, tenantId, medicineIds) {
    const patient = await prisma.patient.findFirst({
      where: { id: patientId, tenantId, deletedAt: null },
    });
    if (!patient) throw new Error('Patient not found');

    const allergies = patient.allergies || [];
    if (!allergies.length) return { safe: true, conflicts: [] };

    const medicines = await prisma.medicine.findMany({
      where: { id: { in: medicineIds }, tenantId },
      select: { id: true, name: true, genericName: true },
    });

    const conflicts = [];
    for (const med of medicines) {
      const medName = (med.name || '').toLowerCase();
      const genericName = (med.genericName || '').toLowerCase();
      for (const allergy of allergies) {
        const a = allergy.toLowerCase();
        if (genericName.includes(a) || medName.includes(a)) {
          conflicts.push({
            medicineId: med.id,
            medicineName: med.name,
            allergy,
            severity: 'WARNING',
          });
        }
      }
    }

    return { safe: conflicts.length === 0, conflicts };
  }

  async validateInsurance(patientId, tenantId) {
    const patient = await prisma.patient.findFirst({
      where: { id: patientId, tenantId, deletedAt: null },
      select: {
        id: true,
        insuranceProvider: true,
        insurancePolicyNo: true,
        insuranceCoveragePercentage: true,
      },
    });

    if (!patient) throw new Error('Patient not found');
    if (!patient.insuranceProvider || !patient.insurancePolicyNo) {
      return { valid: false, reason: 'No insurance information on file' };
    }

    return {
      valid: true,
      provider: patient.insuranceProvider,
      policyNo: patient.insurancePolicyNo,
      coverage: patient.insuranceCoveragePercentage,
    };
  }

  async updateInsurance(patientId, tenantId, data, updatedBy) {
    const patient = await prisma.patient.findFirst({
      where: { id: patientId, tenantId, deletedAt: null },
    });
    if (!patient) throw new Error('Patient not found');

    const updated = await prisma.patient.update({
      where: { id: patientId },
      data: {
        insuranceProvider: data.insuranceProvider,
        insurancePolicyNo: data.insurancePolicyNo,
        insuranceCoveragePercentage: data.insuranceCoveragePercentage ?? 0,
      },
    });

    emitLocalEvent(DOMAIN_EVENTS.INSURANCE_UPDATED, {
      patientId,
      tenantId,
      previous: {
        provider: patient.insuranceProvider,
        policyNo: patient.insurancePolicyNo,
      },
      current: {
        provider: data.insuranceProvider,
        policyNo: data.insurancePolicyNo,
      },
      updatedBy,
    });

    return updated;
  }

  async getComplianceReport(patientId, tenantId) {
    const patient = await prisma.patient.findFirst({
      where: { id: patientId, tenantId, deletedAt: null },
      include: {
        patientAdherence: {
          orderBy: { createdAt: 'desc' },
          take: 50,
        },
        patientRefills: {
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
        prescriptions: {
          where: { status: { not: 'ARCHIVED' } },
          include: { items: true },
        },
      },
    });

    if (!patient) throw new Error('Patient not found');

    const totalDoses = patient.patientAdherence.length;
    const takenDoses = patient.patientAdherence.filter((a) => a.taken).length;
    const adherenceRate = totalDoses > 0 ? Math.round((takenDoses / totalDoses) * 100) : null;

    const refillCompliance =
      patient.patientRefills.length > 0
        ? (patient.patientRefills.filter((r) => r.status === 'COLLECTED').length /
            patient.patientRefills.length) *
          100
        : null;

    return {
      patientId,
      patientName: patient.fullName,
      allergies: patient.allergies,
      chronicConditions: patient.chronicConditions,
      adherenceRate,
      refillCompliance: refillCompliance ? `${Math.round(refillCompliance)}%` : 'N/A',
      activePrescriptions: patient.prescriptions.filter((p) => p.status === 'ACTIVE').length,
      recentAdherence: patient.patientAdherence.slice(0, 10),
    };
  }
}

export default new PatientComplianceService();
