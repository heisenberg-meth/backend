import disposeService from '../service/dispose.service.js';
import { success, error as errorResponse } from '../../../shared/helpers/response.js';

class DisposeController {
  async disposeInventory(request, reply) {
    try {
      const { batchIds, reason, notes } = request.body;
      const result = await disposeService.disposeBatches(
        request.tenantId,
        request.user.id,
        batchIds,
        reason,
        notes,
      );
      return success(result);
    } catch (err) {
      return reply.code(400).send(errorResponse(err.message, 'DISPOSAL_FAILED'));
    }
  }

  async getDisposalHistory(request, reply) {
    try {
      const filters = request.query;
      const result = await disposeService.getDisposalHistory(request.tenantId, filters);
      return success(result);
    } catch (err) {
      return reply.code(400).send(errorResponse(err.message, 'DISPOSAL_HISTORY_FAILED'));
    }
  }
}

export default new DisposeController();
