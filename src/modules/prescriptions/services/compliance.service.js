
class PrescriptionComplianceService {
  SCHEDULE_H1 = ['H1'];
  SCHEDULE_X = ['X'];
  CONTROLLED = ['X', 'H1', 'NARCOTIC', 'PSYCHOTROPIC'];

  ANTIBIOTIC_DISPENSING_WINDOW_DAYS = 7;
  STANDARD_DISPENSING_WINDOW_DAYS = 30;
  CONTROLLED_DISPENSING_WINDOW_DAYS = 7;

  checkMedicineCompliance(prescriptionItem, medicine) {
    const scheduleType = (medicine?.scheduleType || '').toUpperCase();
    const issues = [];

    if (this.CONTROLLED.includes(scheduleType)) {
      issues.push({
        type: 'CONTROLLED_SUBSTANCE',
        severity: 'HIGH',
        message: `${medicine.name} (Schedule ${scheduleType}) requires mandatory prescription verification`,
      });
    }

    if (scheduleType === 'X') {
      issues.push({
        type: 'SCHEDULE_X',
        severity: 'CRITICAL',
        message: 'Schedule X medicine: pharmacist verification legally required before dispensing',
      });
    }

    if (medicine?.prescriptionRequired && !prescriptionItem.prescriptionId) {
      issues.push({
        type: 'PRESCRIPTION_REQUIRED',
        severity: 'HIGH',
        message: `${medicine.name} requires a valid prescription`,
      });
    }

    return { compliant: issues.length === 0, issues };
  }

  checkPrescriptionValidity(prescription) {
    if (!prescription || prescription.deletedAt) {
      return { valid: false, reason: 'Prescription not found or archived' };
    }

    if (prescription.status === 'EXPIRED') {
      return { valid: false, reason: 'Prescription has expired' };
    }

    if (prescription.status === 'ARCHIVED') {
      return { valid: false, reason: 'Prescription has been archived' };
    }

    if (prescription.status === 'DISPENSED') {
      const allDispensed = prescription.items?.every((i) => (i.dispensedQuantity || 0) >= i.quantity);
      if (allDispensed) {
        return { valid: false, reason: 'Prescription fully dispensed' };
      }
    }

    const daysSincePrescription = (Date.now() - new Date(prescription.prescriptionDate).getTime()) / (1000 * 60 * 60 * 24);

    const hasAntibiotic = prescription.items?.some((i) => {
      const schedule = (i.medicine?.scheduleType || '').toUpperCase();
      return schedule === 'H' || schedule === 'H1';
    });

    const maxWindow = hasAntibiotic
      ? this.ANTIBIOTIC_DISPENSING_WINDOW_DAYS
      : this.STANDARD_DISPENSING_WINDOW_DAYS;

    if (daysSincePrescription > maxWindow) {
      return {
        valid: false,
        reason: `Prescription exceeded ${maxWindow}-day dispensing window (${Math.floor(daysSincePrescription)} days old)`,
      };
    }

    return { valid: true, daysSincePrescription: Math.floor(daysSincePrescription) };
  }

  checkDispensingRestrictions(medicine, quantity) {
    const issues = [];
    const scheduleType = (medicine?.scheduleType || '').toUpperCase();

    if (this.SCHEDULE_X.includes(scheduleType) && quantity > 30) {
      issues.push({
        type: 'SCHEDULE_X_QUANTITY',
        severity: 'HIGH',
        message: 'Schedule X dispensing limited to 30 days supply',
      });
    }

    if (medicine?.storageCondition === 'COLD_STORAGE' && quantity > 90) {
      issues.push({
        type: 'COLD_CHAIN_QUANTITY',
        severity: 'MEDIUM',
        message: 'Cold-chain medicine quantity exceeds 90-day supply',
      });
    }

    return { restricted: issues.length > 0, issues };
  }

  checkPrescriptionVerification(prescription) {
    if (prescription.verificationStatus === 'REJECTED') {
      return { valid: false, reason: 'Prescription was rejected by pharmacist' };
    }
    if (prescription.verificationStatus !== 'VERIFIED') {
      return { valid: false, reason: 'Prescription not yet verified' };
    }
    return { valid: true };
  }

  async validatePrescriptionForDispensing(prescription) {
    const validityCheck = this.checkPrescriptionValidity(prescription);
    if (!validityCheck.valid) return validityCheck;

    const verificationCheck = this.checkPrescriptionVerification(prescription);
    if (!verificationCheck.valid) return verificationCheck;

    const scheduleXItems = (prescription.items || []).filter((i) => {
      const schedule = (i.medicine?.scheduleType || '').toUpperCase();
      return schedule === 'X';
    });

    if (scheduleXItems.length > 0 && prescription.verificationStatus !== 'VERIFIED') {
      return {
        valid: false,
        reason: 'Schedule X medicines require verified prescription',
        severity: 'CRITICAL',
      };
    }

    return { valid: true };
  }
}

export default new PrescriptionComplianceService();
