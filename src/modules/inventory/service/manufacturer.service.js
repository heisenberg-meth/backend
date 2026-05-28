import manufacturerRepository from '../repository/manufacturer.repository.js';

class ManufacturerService {
  async getManufacturers(tenantId) {
    return manufacturerRepository.findAll(tenantId);
  }

  async getManufacturerById(id, tenantId) {
    return manufacturerRepository.findById(id, tenantId);
  }

  async createManufacturer(tenantId, data) {
    return manufacturerRepository.create({ ...data, tenantId });
  }

  async updateManufacturer(id, tenantId, data) {
    return manufacturerRepository.update(id, tenantId, data);
  }

  async deleteManufacturer(id, tenantId) {
    return manufacturerRepository.delete(id, tenantId);
  }
}

export default new ManufacturerService();
