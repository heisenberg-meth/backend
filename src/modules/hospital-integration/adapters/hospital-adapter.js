/**
 * Abstract base class for all hospital system adapters.
 * Ensures consistent interface for HL7, FHIR, and proprietary HIS systems.
 */
class HospitalAdapter {
  async connect() {
    throw new Error('connect() not implemented');
  }

  async fetchPatient() {
    throw new Error('fetchPatient() not implemented');
  }

  async syncPrescription() {
    throw new Error('syncPrescription() not implemented');
  }
}

export default HospitalAdapter;
