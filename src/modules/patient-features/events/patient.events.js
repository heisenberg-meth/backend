import { localEventBus } from '../../../shared/events/local-event-bus.js';
import { emitEvent } from '../../../shared/events/erp-event-bus.js';
import logger from '../../../shared/utils/logger.js';

export function initPatientEventListeners() {
  localEventBus.on('PATIENT_CREATED', async (data) => {
    logger.info({ patientId: data.patientId }, 'Patient created');
    await emitEvent('PATIENT_CREATED', data);
  });

  localEventBus.on('PATIENT_UPDATED', async (data) => {
    logger.info({ patientId: data.patientId }, 'Patient updated');
    await emitEvent('PATIENT_UPDATED', data);
  });

  localEventBus.on('PATIENT_REFILL_DUE', async (data) => {
    logger.info({ patientId: data.patientId, medicineId: data.medicineId }, 'Refill due');
    await emitEvent('PATIENT_REFILL_DUE', data);
  });

  localEventBus.on('PRESCRIPTION_EXPIRED', async (data) => {
    logger.info({ prescriptionId: data.prescriptionId }, 'Prescription expired');
    await emitEvent('PRESCRIPTION_EXPIRED', data);
  });

  localEventBus.on('ADHERENCE_RISK_DETECTED', async (data) => {
    logger.info(
      { patientId: data.patientId, adherenceRate: data.adherenceRate },
      'Adherence risk detected',
    );
    await emitEvent('ADHERENCE_RISK_DETECTED', data);
  });
}
