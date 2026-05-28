export class PrescriptionResponse {
  constructor(p) {
    this.id = p.id;
    this.prescriptionNumber = p.prescriptionNumber;
    this.patientId = p.patientId;
    this.patientName = p.patient?.fullName;
    this.doctorId = p.doctorId;
    this.doctorName = p.doctorName || p.doctor?.doctorName;
    this.prescriptionDate = p.prescriptionDate;
    this.status = p.status;
    this.verificationStatus = p.verificationStatus;
    this.verifiedBy = p.verifiedBy;
    this.verifiedAt = p.verifiedAt;
    this.refillCount = p.refillCount;
    this.refillMax = p.refillMax;
    this.notes = p.notes;
    this.prescriptionFileUrl = p.prescriptionFileUrl;
    this.insuranceProvider = p.insuranceProvider;
    this.insurancePolicyNo = p.insurancePolicyNo;
    this.insuranceCoveragePercentage = p.insuranceCoveragePercentage;
    this.items = (p.items || []).map(PrescriptionItemResponse);
    this.verifications = (p.verifications || []).map(PrescriptionVerificationResponse);
    this.createdAt = p.createdAt;
  }
}

export function PrescriptionItemResponse(item) {
  return {
    id: item.id,
    medicineId: item.medicineId,
    medicineName: item.medicine?.name,
    medicineHsn: item.medicine?.hsnCode,
    scheduleType: item.medicine?.scheduleType,
    dosage: item.dosage,
    frequency: item.frequency,
    durationDays: item.durationDays,
    quantity: item.quantity,
    dispensingWindowDays: item.dispensingWindowDays,
    refillEligible: item.refillEligible,
    dispensedQuantity: item.dispensedQuantity,
    instructions: item.instructions,
  };
}

export function PrescriptionVerificationResponse(v) {
  return {
    id: v.id,
    verifiedBy: v.verifiedBy,
    userName: v.user?.fullName,
    status: v.status,
    rejectionReason: v.rejectionReason,
    verifiedAt: v.verifiedAt,
  };
}

export class PrescriptionSummaryResponse {
  constructor(p) {
    this.id = p.id;
    this.prescriptionNumber = p.prescriptionNumber;
    this.patientName = p.patient?.fullName;
    this.doctorName = p.doctorName || p.doctor?.doctorName;
    this.prescriptionDate = p.prescriptionDate;
    this.status = p.status;
    this.verificationStatus = p.verificationStatus;
    this.itemCount = p.items?.length || 0;
    this.createdAt = p.createdAt;
  }
}
