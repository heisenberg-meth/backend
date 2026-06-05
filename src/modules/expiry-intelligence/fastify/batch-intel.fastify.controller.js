import batchRepository from '../repositories/batch.repository.js';
import quarantineService from '../services/quarantine.service.js';
import { success, error } from '../../../shared/helpers/response.js';

class BatchIntelFastifyController {
  async getBatches(request, reply) {
    const { status, medicineId, minQty } = request.query;
    const batches = await batchRepository.findAll(request.tenantId, {
      status,
      medicineId,
      minQty: minQty ? parseInt(minQty) : undefined,
    });
    return reply.send(success(batches));
  }

  async getNearExpiryBatches(request, reply) {
    const { days } = request.query;
    const batches = await batchRepository.getNearExpiry(request.tenantId, parseInt(days) || 90);
    return reply.send(success(batches));
  }

  async quarantineBatch(request, reply) {
    try {
      const { batchId, reason } = request.body;
      if (!batchId) return reply.code(400).send(error('batchId is required', 'VALIDATION_ERROR'));
      const result = await quarantineService.quarantine(
        request.tenantId,
        batchId,
        reason,
        request.user.id,
      );
      return reply.send(success(result));
    } catch (err) {
      return reply.code(500).send(error(err.message, 'INTERNAL_SERVER_ERROR'));
    }
  }
}

export default new BatchIntelFastifyController();
