import HospitalAdapter from './hospital-adapter.js';
import axios from 'axios';
import logger from '../../../shared/utils/logger.js';

class FhirAdapter extends HospitalAdapter {
  constructor(baseUrl, apiKey) {
    super();
    this.client = axios.create({
      baseURL: baseUrl,
      headers: { Authorization: `Bearer ${apiKey}` },
    });
  }

  async connect() {
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
      return response.data;
    } catch (err) {
      logger.error({ err }, `[FHIR_ADAPTER] Failed to fetch patient ${externalId}`);
      return null;
    }
  }

  async syncPrescription(medicationRequest) {
    try {
      logger.info({ id: medicationRequest.id }, '[FHIR_ADAPTER] Syncing MedicationRequest');
      return { status: 'SYNCED', externalId: medicationRequest.id };
    } catch (err) {
      logger.error({ err }, '[FHIR_ADAPTER] Sync failed');
      throw err;
    }
  }
}

export default FhirAdapter;
