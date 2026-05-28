import manufacturerRepository from '../repositories/manufacturer.repository.js';
import auditService from '../../audit/service/audit.prisma.service.js';

class ManufacturerService {
  async getManufacturers(tenantId) {
    return manufacturerRepository.findAll(tenantId);
  }

  async getManufacturerById(id, tenantId) {
    const manufacturer = await manufacturerRepository.findById(id, tenantId);
    if (!manufacturer) throw new Error('Manufacturer not found');
    return manufacturer;
  }

  async createManufacturer(data, tenantId, userId) {
    const manufacturer = await manufacturerRepository.create({ ...data, tenantId });

    await auditService.log({
      tenantId,
      userId,
      action: 'CREATE_MANUFACTURER',
      target: manufacturer.name,
      type: 'INVENTORY',
    });

    return manufacturer;
  }

  async updateManufacturer(id, tenantId, data, userId) {
    const manufacturer = await manufacturerRepository.update(id, tenantId, data);

    await auditService.log({
      tenantId,
      userId,
      action: 'UPDATE_MANUFACTURER',
      target: manufacturer.name,
      type: 'INVENTORY',
    });

    return manufacturer;
  }

  async deleteManufacturer(id, tenantId, userId) {
    const manufacturer = await manufacturerRepository.findById(id, tenantId);
    if (!manufacturer) throw new Error('Manufacturer not found');

    await manufacturerRepository.softDelete(id, tenantId);

    await auditService.log({
      tenantId,
      userId,
      action: 'DELETE_MANUFACTURER',
      target: manufacturer.name,
      type: 'INVENTORY',
    });
  }
}

export default new ManufacturerService();
