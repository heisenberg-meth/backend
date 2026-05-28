import gstAdjustmentService from '../gst-adjustments/gst-adjustment.service.js';
import logger from '../../../shared/utils/logger.js';

export async function processGstRecalculation(data) {
  const { tenantId, year, month } = data;

  logger.info(`[Worker] Recalculating GST for tenant ${tenantId}, ${year}-${month}`);

  try {
    const impact = await gstAdjustmentService.getGstImpact(tenantId, year, month);
    logger.info(`[Worker] GST recalculation complete: ${JSON.stringify(impact)}`);
    return impact;
  } catch (err) {
    logger.error(`[Worker] GST recalculation failed: ${err.message}`);
    throw err;
  }
}
