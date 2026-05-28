import { emitLocalEvent } from '../../../shared/events/local-event-bus.js';
import { EVENTS } from '../../../shared/constants/events.js';

export function emitPrescriptionCreated(prescriptionId, prescriptionNumber, patientId, tenantId) {
  emitLocalEvent(EVENTS.PRESCRIPTION_CREATED, {
    prescriptionId, prescriptionNumber, patientId, tenantId,
    timestamp: new Date().toISOString(),
  });
}

export function emitPrescriptionVerified(prescriptionId, verifiedBy) {
  emitLocalEvent(EVENTS.PRESCRIPTION_VERIFIED, {
    prescriptionId, verifiedBy,
    timestamp: new Date().toISOString(),
  });
}

export function emitPrescriptionRejected(prescriptionId, verifiedBy, reason) {
  emitLocalEvent(EVENTS.PRESCRIPTION_REJECTED, {
    prescriptionId, verifiedBy, reason,
    timestamp: new Date().toISOString(),
  });
}

export function emitPrescriptionDispensed(prescriptionId, fullyDispensed) {
  emitLocalEvent(EVENTS.PRESCRIPTION_DISPENSED, {
    prescriptionId, fullyDispensed,
    timestamp: new Date().toISOString(),
  });
}
