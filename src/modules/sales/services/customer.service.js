import customerRepository from '../repositories/patient.repository.js';

class CustomerService {
  async getCustomers(tenantId) {
    return customerRepository.findAll(tenantId);
  }

  async getCustomerById(id, tenantId) {
    const patient = await customerRepository.findById(id, tenantId);
    if (!patient) throw new Error('Patient not found');
    return patient;
  }

  async createCustomer(tenantId, data) {
    if (data.phone) {
      const existing = await customerRepository.findByPhone(data.phone, tenantId);
      if (existing) return existing; // Auto-link existing patient by phone
    }
    return customerRepository.create({ ...data, tenantId });
  }

  async updateCustomer(id, tenantId, data) {
    await this.getCustomerById(id, tenantId);
    return customerRepository.update(id, tenantId, data);
  }

  async deleteCustomer(id, tenantId) {
    await this.getCustomerById(id, tenantId);
    return customerRepository.delete(id, tenantId);
  }
}

export default new CustomerService();
