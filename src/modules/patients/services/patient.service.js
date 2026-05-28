import patientRepository from '../repositories/patient.repository.js';
import notificationService from './notification.service.js';

class PatientService {
  async getCustomers(tenantId, options = {}) {
    return patientRepository.findAll(tenantId, options);
  }

  async searchCustomers(tenantId, query) {
    return patientRepository.search(tenantId, query);
  }

  async getCustomerById(id, tenantId) {
    const patient = await patientRepository.findById(id, tenantId);
    if (!patient) throw new Error('Patient not found');
    return patient;
  }

  async createCustomer(tenantId, data, createdBy = null) {
    // Repository now handles: phone validation, age validation, duplicate detection, patient code generation
    return patientRepository.create(tenantId, data, createdBy);
  }

  async updateCustomer(id, tenantId, data, updatedBy = null) {
    // Repository now handles: validation, duplicate phone check, field-level audit logging
    return patientRepository.update(id, tenantId, data, updatedBy);
  }

  async deleteCustomer(id, tenantId) {
    // Soft delete — archives patient, never hard deletes
    return patientRepository.delete(id, tenantId);
  }

  async updateCustomerStats(id, tenantId, amount) {
    return patientRepository.updateStats(id, tenantId, amount);
  }

  async getPurchaseHistory(id, tenantId) {
    await this.getCustomerById(id, tenantId);
    return patientRepository.getPurchaseHistory(id, tenantId);
  }

  async getPrescriptions(id, tenantId) {
    await this.getCustomerById(id, tenantId);
    return patientRepository.getPrescriptions(id, tenantId);
  }

  async getInvoices(id, tenantId) {
    await this.getCustomerById(id, tenantId);
    return patientRepository.getInvoices(id, tenantId);
  }

  async getRefills(id, tenantId) {
    const prescriptions = await this.getPrescriptions(id, tenantId);
    const refills = prescriptions.map(p => {
      return p.items.map(item => ({
        medicineName: item.medicine.name,
        dosage: item.dosage,
        instructions: item.instructions,
        remainingRefills: 0,
        nextRefillDate: null
      }));
    }).flat();
    return refills;
  }

  async getLoyalty(id, tenantId) {
    const patient = await this.getCustomerById(id, tenantId);
    const history = await patientRepository.getLoyaltyHistory(id, tenantId);
    return {
      points: patient.loyaltyPoints,
      history
    };
  }

  async addCredit(id, tenantId, amount) {
    await this.getCustomerById(id, tenantId);
    return patientRepository.addCredit(id, tenantId, amount);
  }

  async sendRefillReminder(id, tenantId) {
    const patient = await this.getCustomerById(id, tenantId);
    if (!patient.phone) throw new Error('Patient does not have a phone number');

    return notificationService.sendSms(tenantId, {
      patientId: id,
      phone: patient.phone,
      message: `Hi ${patient.fullName}, it's time for your medicine refill. Please visit us soon.`,
      type: 'REFILL_REMINDER'
    });
  }
}

export default new PatientService();
