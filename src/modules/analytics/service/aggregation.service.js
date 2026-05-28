import prisma from '../../../config/prisma.js';
import logger from '../../../shared/utils/logger.js';
import rankingService from './ranking.service.js';
import deadStockService from './deadstock.service.js';
import heatmapService from './heatmap.service.js';

class AggregationService {
  async runNightlyInventoryAnalysis() {
    logger.info('[AggregationService] Starting Nightly Inventory Analysis');

    // Get all active tenants
    const tenants = await prisma.tenant.findMany({
      where: { deletedAt: null },
      select: { id: true },
    });

    for (const tenant of tenants) {
      try {
        await rankingService.updateFastMovers(tenant.id);
        await deadStockService.updateDeadStock(tenant.id);
      } catch (error) {
        logger.error(`[AggregationService] Error processing tenant ${tenant.id}: ${error.message}`);
      }
    }

    logger.info('[AggregationService] Completed Nightly Inventory Analysis');
  }

  async runHourlyRevenueAggregation() {
    logger.info('[AggregationService] Starting Hourly Revenue Aggregation');
    
    const tenants = await prisma.tenant.findMany({
      where: { deletedAt: null },
      select: { id: true }
    });

    for (const tenant of tenants) {
      try {
        await heatmapService.updateRevenueHeatmap(tenant.id);
      } catch (error) {
        logger.error(`[AggregationService] Error processing tenant ${tenant.id}: ${error.message}`);
      }
    }
    
    logger.info('[AggregationService] Completed Hourly Revenue Aggregation');
  }
}

export default new AggregationService();
