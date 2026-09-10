import inventoryClearService from '../service/inventory-clear.service.js';
import { error as errorResponse } from '../../../shared/helpers/response.js';

class InventoryClearController {
  /**
   * GET /api/inventory/clear-summary
   * Fetches the number of active batches and total units that will be cleared.
   */
  async getClearSummary(request, reply) {
    try {
      const branchId = request.query?.branchId || request.branchId;
      if (!branchId || ['all', 'null', 'undefined'].includes(branchId)) {
        return reply.code(400).send({
          success: false,
          error: {
            code: 'BRANCH_REQUIRED',
            message: 'A valid branch is required.',
          },
        });
      }

      if (typeof reply.header === 'function') {
        reply.header('Cache-Control', 'no-store, no-cache, must-revalidate');
        reply.header('Pragma', 'no-cache');
      }

      const summary = await inventoryClearService.getClearSummary(request.tenantId, branchId);

      return reply.send({
        success: true,
        data: summary,
        summary,
      });
    } catch (err) {
      if (err.statusCode) {
        return reply.code(err.statusCode).send({
          success: false,
          error: {
            code: err.errorCode || 'CLEAR_SUMMARY_ERROR',
            message: err.message,
          },
        });
      }
      request.log.error({ err }, 'Failed to fetch inventory clear summary');
      return reply
        .code(500)
        .send(
          errorResponse(err.message || 'Failed to retrieve clear summary', 'CLEAR_SUMMARY_ERROR'),
        );
    }
  }

  /**
   * POST /api/inventory/clear
   * Clears active inventory for the authenticated tenant and branch.
   */
  async clearInventory(request, reply) {
    try {
      const branchId = request.query?.branchId || request.branchId;
      const userId = request.user?.id;

      const result = await inventoryClearService.clearBranchInventory(
        request.tenantId,
        branchId,
        userId,
      );

      return reply.code(200).send({
        success: result.success,
        message: result.message,
        summary: result.summary,
        data: result.summary,
      });
    } catch (err) {
      request.log.error({ err }, 'Inventory clear operation failed');

      if (err.statusCode === 409) {
        return reply.code(409).send({
          success: false,
          message: err.message,
          error: {
            code: err.errorCode || 'OPERATION_IN_PROGRESS',
            message: err.message,
          },
        });
      }

      if (err.statusCode === 400) {
        return reply.code(400).send({
          success: false,
          message: err.message,
          error: {
            code: err.errorCode || 'BRANCH_REQUIRED',
            message: err.message,
          },
        });
      }

      return reply.code(500).send({
        success: false,
        message: 'Unable to clear inventory',
        error: {
          code: 'CLEAR_INVENTORY_ERROR',
          message: 'Unable to clear inventory. No inventory changes were made.',
        },
      });
    }
  }
}

export default new InventoryClearController();
