import patientRepository from '../repositories/patient.repository.js';

class PatientService {
  async getCustomers(tenantId) {
    return patientRepository.findAll(tenantId);
  }

  async getCustomerById(id, tenantId) {
    const patient = await patientRepository.findById(id, tenantId);
    if (!patient) throw new Error('Patient not found');
    return patient;
  }

  async createCustomer(tenantId, data) {
    if (data.phone) {
      const existing = await patientRepository.findByPhone(data.phone, tenantId);
      if (existing) return existing; // Auto-link existing patient by phone
    }
    return patientRepository.create({ ...data, tenantId });
  }

  async updateCustomer(id, tenantId, data) {
    await this.getCustomerById(id, tenantId);
    return patientRepository.update(id, tenantId, data);
  }

  async deleteCustomer(id, tenantId) {
    await this.getCustomerById(id, tenantId);
    return patientRepository.delete(id, tenantId);
  }
}

export default new PatientService();
