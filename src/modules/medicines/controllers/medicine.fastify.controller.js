import medicineService from '../services/medicine.service.js';
import logger from '../../../shared/utils/logger.js';

class MedicineFastifyController {
  /**
   * GET /api/medicines
   */
  async getMedicines(request, reply) {
    const { tenantId, branchId } = request.user;
    const { q, categoryId, schedule, page, limit } = request.query;

    try {
      const result = await medicineService.getMedicines({
        tenantId,
        branchId,
        query: { q, categoryId, schedule },
        pagination: { page: parseInt(page) || 1, limit: parseInt(limit) || 50 },
      });
      return { success: true, data: result };
    } catch (error) {
      logger.error({ error, tenantId }, 'Failed to fetch medicines');
      return reply.code(500).send({ success: false, message: 'Internal server error' });
    }
  }

  /**
   * GET /api/medicines/:id
   */
  async getMedicine(request, reply) {
    const { tenantId } = request.user;
    const { id } = request.params;

    try {
      const details = await medicineService.getMedicineDetails(id, tenantId);
      return { success: true, data: details };
    } catch (error) {
      logger.error({ error, id, tenantId }, 'Failed to fetch medicine details');
      return reply.code(404).send({ success: false, message: error.message });
    }
  }

  /**
   * POST /api/medicines
   */
  async createMedicine(request, reply) {
    const { tenantId, id: userId } = request.user;
    const body = { ...request.body };

    // Map legacy field names to new field names
    if (body.name && !body.medicineName) {
      body.medicineName = body.name;
    }
    if (body.manufacturerId && !body.manufacturer) {
      // Keep manufacturerId for resolution in service
    }
    if (body.scheduleType && !body.schedule) {
      // Map scheduleType to schedule enum
      const scheduleMap = {
        'OTC': 'OTC',
        'Schedule H': 'SCHEDULE_H',
        'Schedule H1': 'SCHEDULE_H1',
        'Schedule X': 'SCHEDULE_X',
      };
      body.schedule = scheduleMap[body.scheduleType] || body.scheduleType;
    }

    try {
      const medicine = await medicineService.createMedicineMaster(tenantId, userId, body);
      return reply.code(201).send({ 
        success: true, 
        message: 'Medicine created successfully',
        data: {
          id: medicine.id,
          medicineName: medicine.medicineName,
          genericName: medicine.genericName,
          brandName: medicine.brandName,
          manufacturer: medicine.manufacturerName,
          status: medicine.status,
          createdAt: medicine.createdAt,
        }
      });
    } catch (error) {
      logger.error({ error, tenantId }, 'Failed to create medicine master');
      return reply.code(400).send({ success: false, message: error.message });
    }
  }

  /**
   * PUT /api/medicines/:id
   */
  async updateMedicine(request, reply) {
    const { tenantId, id: userId, role: userRole } = request.user;
    const { id } = request.params;

    try {
      const medicine = await medicineService.updateMedicineMaster(
        id,
        tenantId,
        userId,
        userRole,
        request.body,
      );
      return { success: true, data: medicine };
    } catch (error) {
      logger.error({ error, id, tenantId }, 'Failed to update medicine master');
      const statusCode = error.message.includes('Only owners or admins') ? 403 : 400;
      return reply.code(statusCode).send({ success: false, message: error.message });
    }
  }

  /**
   * DELETE /api/medicines/:id
   */
  async deleteMedicine(request, reply) {
    const { tenantId, id: userId } = request.user;
    const { id } = request.params;

    try {
      const result = await medicineService.deactivateMedicine(id, tenantId, userId);
      return result;
    } catch (error) {
      logger.error({ error, id, tenantId }, 'Failed to deactivate medicine');
      return reply.code(400).send({ success: false, message: error.message });
    }
  }

  /**
   * GET /api/medicines/barcode/:code
   */
  async lookupBarcode(request, reply) {
    const { tenantId } = request.user;
    const { code } = request.params;

    try {
      const medicine = await medicineService.lookupByBarcode(code, tenantId);
      return medicine;
    } catch (error) {
      return reply.code(404).send({ success: false, message: error.message });
    }
  }
}

export default new MedicineFastifyController();
