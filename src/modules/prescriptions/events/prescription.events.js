import { emitLocalEvent } from '../../../shared/events/local-event-bus.js';
import { EVENTS } from '../../../shared/constants/events.js';

export function emitPrescriptionCreated(prescriptionId, prescriptionNumber, patientId, tenantId) {
  emitLocalEvent(EVENTS.PRESCRIPTION_CREATED, {
    prescriptionId,
    prescriptionNumber,
    patientId,
    tenantId,
    timestamp: new Date().toISOString(),
  });
}

export function emitPrescriptionVerified(prescriptionId, verifiedBy, tenantId) {
  emitLocalEvent(EVENTS.PRESCRIPTION_VERIFIED, {
    prescriptionId,
    verifiedBy,
    tenantId,
    timestamp: new Date().toISOString(),
  });
}

export function emitPrescriptionDispensed(prescriptionId, invoiceId, items, tenantId) {
  emitLocalEvent(EVENTS.PRESCRIPTION_DISPENSED, {
    prescriptionId,
    invoiceId,
    items,
    tenantId,
    timestamp: new Date().toISOString(),
  });
}

export function emitPrescriptionRejected(prescriptionId, reason, rejectedBy, tenantId) {
  emitLocalEvent(EVENTS.PRESCRIPTION_REJECTED, {
    prescriptionId,
    reason,
    rejectedBy,
    tenantId,
    timestamp: new Date().toISOString(),
  });
}

export default {
  emitPrescriptionCreated,
  emitPrescriptionVerified,
  emitPrescriptionDispensed,
  emitPrescriptionRejected,
};
