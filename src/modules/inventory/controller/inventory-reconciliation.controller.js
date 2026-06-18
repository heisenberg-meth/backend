/**
 * Inventory Reconciliation API - Single Source of Truth
 * 
 * GET /inventory/reconciliation
 * 
 * Returns unified inventory metrics that all modules must use.
 * Used by Dashboard, Stock, Expiry, Bulk Disposal, Supplier Returns, Reports.
 */

import inventoryStatusService from '../service/inventory-status.service.js';

class InventoryReconciliationController {
  /**
   * Get unified inventory metrics
   * GET /inventory/reconciliation?branchId=xxx
   */
  async getReconciliation(request, reply) {
    try {
      const tenantId = request.tenantId;
      const { branchId } = request.query;

      if (!tenantId) {
        return reply.code(400).send({
          success: false,
          error: 'Tenant ID required',
        });
      }

      const metrics = await inventoryStatusService.getInventoryMetrics(tenantId, branchId);

      return reply.send({
        success: true,
        data: metrics,
      });
    } catch (error) {
      request.log.error({
        endpoint: 'inventory-reconciliation',
        error: error.message,
        stack: error.stack,
      }, 'Failed to get inventory reconciliation');

      return reply.code(500).send({
        success: false,
        error: 'Failed to fetch inventory reconciliation',
      });
    }
  }
}

export default new InventoryReconciliationController();
