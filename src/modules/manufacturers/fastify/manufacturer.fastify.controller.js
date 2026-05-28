import manufacturerService from '../services/manufacturer.service.js';

class ManufacturerFastifyController {
  async getManufacturers(request, reply) {
    try {
      const manufacturers = await manufacturerService.getManufacturers(request.tenantId);
      return reply.send({ success: true, data: manufacturers });
    } catch (error) {
      return reply.code(500).send({ success: false, message: error.message });
    }
  }

  async getManufacturerById(request, reply) {
    try {
      const manufacturer = await manufacturerService.getManufacturerById(request.params.id, request.tenantId);
      return reply.send({ success: true, data: manufacturer });
    } catch (error) {
      return reply.code(404).send({ success: false, message: error.message });
    }
  }

  async createManufacturer(request, reply) {
    try {
      const manufacturer = await manufacturerService.createManufacturer(request.body, request.tenantId, request.user?.id);
      return reply.code(201).send({ success: true, data: manufacturer });
    } catch (error) {
      return reply.code(400).send({ success: false, message: error.message });
    }
  }

  async updateManufacturer(request, reply) {
    try {
      const manufacturer = await manufacturerService.updateManufacturer(request.params.id, request.tenantId, request.body, request.user?.id);
      return reply.send({ success: true, data: manufacturer });
    } catch (error) {
      return reply.code(400).send({ success: false, message: error.message });
    }
  }

  async deleteManufacturer(request, reply) {
    try {
      await manufacturerService.deleteManufacturer(request.params.id, request.tenantId, request.user?.id);
      return reply.send({ success: true, message: 'Manufacturer deleted successfully' });
    } catch (error) {
      return reply.code(400).send({ success: false, message: error.message });
    }
  }
}

export default new ManufacturerFastifyController();
