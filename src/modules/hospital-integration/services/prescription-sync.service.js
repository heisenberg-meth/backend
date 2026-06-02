import patientMappingService from './patient-mapping.service.js';
import prescriptionService from '../../prescriptions/services/prescription.service.js';
import logger from '../../../shared/utils/logger.js';

class PrescriptionSyncService {
  async syncFromExternal(tenantId, externalMedicationRequest, sourceSystem) {
    try {
      const externalPatientId = externalMedicationRequest.subject?.reference?.split('/')[1];
      const patient = await patientMappingService.getOrCreateInternalPatient(
        externalPatientId,
        tenantId,
        sourceSystem,
        { fullName: 'Synced Patient' },
      );

      const items =
        externalMedicationRequest.medicationCodeableConcept?.coding?.map((c) => ({
          medicineName: c.display,
          quantity: externalMedicationRequest.dosageInstruction?.[0]?.doseQuantity?.value || 1,
        })) || [];

      const internalPrescription = await prescriptionService.createPrescription(
        tenantId,
        {
          patientId: patient.id,
          prescriptionDate: new Date(),
          items: items,
        },
        'SYSTEM_SYNC',
      );

      logger.info({ id: internalPrescription.id }, '[PRESCRIPTION_SYNC] Successfully synced');
      return internalPrescription;
    } catch (err) {
      logger.error({ err }, '[PRESCRIPTION_SYNC] Failed to sync prescription');
      throw err;
    }
  }
}

export default new PrescriptionSyncService();
