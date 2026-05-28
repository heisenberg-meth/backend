import service from '../services/patient-features.service.js';

class PatientFeaturesController {
  async getPurchaseHistory(request, reply) {
    try {
      const { id } = request.params;
      const result = await service.getPurchaseHistory(id, request.tenantId, request.query);
      return reply.send({ success: true, data: result });
    } catch (error) {
      const code = error.statusCode || 500;
      return reply.code(code).send({ success: false, message: error.message });
    }
  }

  async getPrescriptions(request, reply) {
    try {
      const { id } = request.params;
      const result = await service.getPrescriptions(id, request.tenantId);
      return reply.send({ success: true, data: result });
    } catch (error) {
      const code = error.statusCode || 500;
      return reply.code(code).send({ success: false, message: error.message });
    }
  }

  async getInvoices(request, reply) {
    try {
      const { id } = request.params;
      const result = await service.getInvoices(id, request.tenantId, request.query);
      return reply.send({ success: true, data: result });
    } catch (error) {
      const code = error.statusCode || 500;
      return reply.code(code).send({ success: false, message: error.message });
    }
  }

  async getRefills(request, reply) {
    try {
      const { id } = request.params;
      const result = await service.getRefills(id, request.tenantId);
      return reply.send({ success: true, data: result });
    } catch (error) {
      const code = error.statusCode || 500;
      return reply.code(code).send({ success: false, message: error.message });
    }
  }

  async getTimeline(request, reply) {
    try {
      const { id } = request.params;
      const result = await service.getTimeline(id, request.tenantId);
      return reply.send({ success: true, data: result });
    } catch (error) {
      const code = error.statusCode || 500;
      return reply.code(code).send({ success: false, message: error.message });
    }
  }

  async getAdherence(request, reply) {
    try {
      const { id } = request.params;
      const result = await service.getAdherenceSummary(id, request.tenantId);
      return reply.send({ success: true, data: result });
    } catch (error) {
      const code = error.statusCode || 500;
      return reply.code(code).send({ success: false, message: error.message });
    }
  }

  async getChronicMedicines(request, reply) {
    try {
      const { id } = request.params;
      const result = await service.getChronicMedicines(id, request.tenantId);
      return reply.send({ success: true, data: result });
    } catch (error) {
      const code = error.statusCode || 500;
      return reply.code(code).send({ success: false, message: error.message });
    }
  }

  async getUpcomingRefills(request, reply) {
    try {
      const daysAhead = parseInt(request.query.daysAhead) || 7;
      const result = await service.getUpcomingRefills(request.tenantId, daysAhead);
      return reply.send({ success: true, data: result });
    } catch (error) {
      return reply.code(500).send({ success: false, message: error.message });
    }
  }

  async checkPrescriptionValidity(request, reply) {
    try {
      const { prescriptionId } = request.params;
      const result = await service.checkPrescriptionValidity(prescriptionId, request.tenantId);
      return reply.send({ success: true, data: result });
    } catch (error) {
      const code = error.statusCode || 500;
      return reply.code(code).send({ success: false, message: error.message });
    }
  }
}

export default new PatientFeaturesController();
