import printService from '../services/print.service.js';
import logger from '../../../shared/utils/logger.js';

export async function processPrintJob(data) {
  const { printJobId } = data;

  logger.info(`[Worker] Processing print job ${printJobId}`);

  try {
    const result = await printService.processPrintJob(printJobId);
    logger.info(`[Worker] Print job completed: ${result.status}`);
    return result;
  } catch (err) {
    logger.error(`[Worker] Print job failed: ${err.message}`);
    throw err;
  }
}
