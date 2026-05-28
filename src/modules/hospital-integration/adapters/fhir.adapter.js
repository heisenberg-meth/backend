import HospitalAdapter from './hospital-adapter.js';
import axios from 'axios';
import logger from '../../../shared/utils/logger.js';

/**
 * FHIR Adapter for integrating with modern EHR/HIS systems.
 */
class FhirAdapter extends HospitalAdapter {
  constructor(baseUrl, apiKey) {
    super();
    this.client = axios.create({
      baseURL: baseUrl,
      headers: { 'Authorization': `Bearer ${apiKey}` }
    });
  }

  async connect() {
    // Verify connection to FHIR server
    try {
      await this.client.get('/metadata');
      logger.info('[FHIR_ADAPTER] Connection verified');
      return true;
    } catch (err) {
      logger.error({ err }, '[FHIR_ADAPTER] Connection failed');
      return false;
    }
  }

  async fetchPatient(externalId) {
    try {
      const response = await this.client.get(`/Patient/${externalId}`);
      return response.data; // FHIR Patient resource
    } catch (err) {
      logger.error({ err }, `[FHIR_ADAPTER] Failed to fetch patient ${externalId}`);
      return null;
    }
  }

  /**
   * Syncs a MedicationRequest FHIR resource
   */
  async syncPrescription(medicationRequest) {
    try {
      // Logic to parse FHIR MedicationRequest and map to internal prescription DTO
      logger.info({ id: medicationRequest.id }, '[FHIR_ADAPTER] Syncing MedicationRequest');
      // ... mapping logic
      return { status: 'SYNCED', externalId: medicationRequest.id };
    } catch (err) {
      logger.error({ err }, '[FHIR_ADAPTER] Sync failed');
      throw err;
    }
  }
}

export default FhirAdapter;
