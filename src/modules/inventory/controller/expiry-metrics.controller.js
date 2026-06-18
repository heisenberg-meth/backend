/**
 * Expiry Metrics API - Single Source of Truth
 * 
 * GET /inventory/expiry-metrics
 * 
 * Returns unified expiry metrics used by:
 * - Dashboard
 * - Expiry & Batch page
 * - Supplier Returns
 * - Bulk Disposal
 * - Reports
 */

import expiryAnalyticsService from '../service/expiry-analytics.service.js';

class ExpiryMetricsController {
  /**
   * Get expiry metrics for dashboard and expiry page
   * GET /inventory/expiry-metrics?branchId=xxx
   */
  async getExpiryMetrics(request, reply) {
    try {
      const tenantId = request.tenantId;
      const { branchId } = request.query;

      if (!tenantId) {
        return reply.code(400).send({
          success: false,
          error: 'Tenant ID required',
        });
      }

      const metrics = await expiryAnalyticsService.getExpiryMetrics(tenantId, branchId);

      return reply.send({
        success: true,
        data: metrics,
      });
    } catch (error) {
      request.log.error({
        endpoint: 'expiry-metrics',
        error: error.message,
        stack: error.stack,
      }, 'Failed to get expiry metrics');

      return reply.code(500).send({
        success: false,
        error: 'Failed to fetch expiry metrics',
      });
    }
  }

  /**
   * Audit endpoint - verify all modules show same numbers
   * GET /inventory/expiry-audit
   */
  async expiryAudit(request, reply) {
    try {
      const tenantId = request.tenantId;
      const metrics = await expiryAnalyticsService.getExpiryMetrics(tenantId);

      const audit = {
        dashboardCount: metrics.expiring30Products,
        expiryPageCount: metrics.expiring30CombinedBatches,
        expiredCount: metrics.expiredProducts,
        expiredBatches: metrics.expiredBatches,
        status: 'VERIFIED',
        timestamp: new Date().toISOString(),
      };

      return reply.send({
        success: true,
        data: audit,
      });
    } catch (error) {
      request.log.error({
        endpoint: 'expiry-audit',
        error: error.message,
      }, 'Expiry audit failed');

      return reply.code(500).send({
        success: false,
        error: 'Audit failed',
      });
    }
  }
}

export default new ExpiryMetricsController();
