import fraudDetectionService from '../fraud-detection/fraud-detection.service.js';
import logger from '../../../shared/utils/logger.js';

export async function processFraudScan(data) {
  const { tenantId } = data;

  logger.info(`[Worker] Running fraud scan for tenant ${tenantId}`);

  try {
    const stats = await fraudDetectionService.getFraudStats(tenantId);
    logger.info(`[Worker] Fraud scan complete: ${JSON.stringify(stats)}`);
    return stats;
  } catch (err) {
    logger.error(`[Worker] Fraud scan failed: ${err.message}`);
    throw err;
  }
}
