import disposalService from './disposal.service.js';
import { success, error as errorResponse } from '../../shared/helpers/response.js';

class DisposalController {
  async getExpiredBatches(request, reply) {
    try {
      const { branchId } = request.query;
      const batches = await disposalService.getExpiredBatches(
        request.tenantId,
        branchId || request.branchId,
      );
      return success(batches);
    } catch (error) {
      request.log.error({ err: error, endpoint: 'disposal-expired-batches' }, 'Disposal error');
      return reply.code(500).send(errorResponse(error.message, 'DISPOSAL_ERROR'));
    }
  }

  async getExpiredOverview(request, reply) {
    try {
      const { branchId } = request.query;
      const overview = await disposalService.getExpiredOverview(
        request.tenantId,
        branchId || request.branchId,
      );
      return success(overview);
    } catch (error) {
      request.log.error({ err: error, endpoint: 'disposal-expired-overview' }, 'Disposal error');
      return reply.code(500).send(errorResponse(error.message, 'DISPOSAL_ERROR'));
    }
  }

  async bulkDispose(request, reply) {
    try {
      const { branchId } = request.query;
      const result = await disposalService.bulkDispose(
        request.tenantId,
        request.user.id,
        branchId || request.branchId,
        request.body,
      );
      return success(result);
    } catch (err) {
      request.log.error({ err, endpoint: 'disposal-bulk' }, 'Disposal error');
      return reply.code(400).send(errorResponse(err.message, 'DISPOSAL_FAILED'));
    }
  }

  async getDisposalHistory(request, reply) {
    try {
      const { branchId, page, limit } = request.query;
      const result = await disposalService.getDisposalHistory(
        request.tenantId,
        branchId || request.branchId,
        { page: parseInt(page) || 1, limit: parseInt(limit) || 20 },
      );
      return success(result.items, { total: result.total, page: result.page, limit: result.limit });
    } catch (error) {
      request.log.error({ err: error, endpoint: 'disposal-history' }, 'Disposal error');
      return reply.code(500).send(errorResponse(error.message, 'DISPOSAL_ERROR'));
    }
  }
}

export default new DisposalController();
