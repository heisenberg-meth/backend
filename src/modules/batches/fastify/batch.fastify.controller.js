import batchService from '../services/batch.service.js';

class BatchFastifyController {
  async createBatch(request, reply) {
    const batch = await batchService.createBatch(request.body, request.tenantId, request.user.id);
    return reply.code(201).send({ success: true, data: batch });
  }

  async getBatches(request, reply) {
    const { page = 1, limit = 20, status, branchId, supplierId, sortBy, order } = request.query;
    const result = await batchService.getBatches({
      tenantId: request.tenantId,
      status,
      branchId,
      supplierId,
      sortBy: sortBy || 'expiryDate',
      order: order || 'asc',
      skip: (parseInt(page) - 1) * parseInt(limit),
      take: parseInt(limit),
    });
    return reply.send({ success: true, data: result });
  }

  async getBatchById(request, reply) {
    const batch = await batchService.getBatch(request.params.id);
    return reply.send({ success: true, data: batch });
  }

  async updateBatch(request, reply) {
    const batch = await batchService.updateBatch(request.params.id, request.body, request.user.id);
    return reply.send({ success: true, data: batch });
  }

  async deleteBatch(request, reply) {
    await batchService.deleteBatch(request.params.id, request.tenantId, request.user.id);
    return reply.send({ success: true, message: 'Batch deleted successfully' });
  }

  async quarantineBatch(request, reply) {
    const batch = await batchService.quarantineBatch(
      request.params.id, request.body.reason, request.tenantId, request.user.id
    );
    return reply.send({ success: true, data: batch, message: 'Batch quarantined successfully' });
  }

  async recallBatch(request, reply) {
    const batch = await batchService.recallBatch(
      request.params.id, request.body.reason, request.tenantId, request.user.id
    );
    return reply.send({ success: true, data: batch, message: 'Batch recalled successfully' });
  }

  async releaseQuarantine(request, reply) {
    const batch = await batchService.releaseQuarantine(request.params.id, request.tenantId, request.user.id);
    return reply.send({ success: true, data: batch, message: 'Batch released from quarantine' });
  }

  async getFefoBatches(request, reply) {
    const { quantity } = request.query;
    const result = await batchService.getFefoBatches(request.params.medicineId, request.tenantId, quantity);
    return reply.send({ success: true, data: result });
  }

  async getQuarantined(request, reply) {
    const batches = await batchService.getQuarantined(request.tenantId);
    return reply.send({ success: true, data: batches });
  }
}

export default new BatchFastifyController();
