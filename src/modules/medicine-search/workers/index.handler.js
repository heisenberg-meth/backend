import medicineSearchCache from '../cache/medicine-search.cache.js';
import logger from '../../../shared/utils/logger.js';

export async function processIndexSync(data) {
  const { tenantId } = data;

  logger.info(`[Worker] Syncing search index for tenant ${tenantId}`);

  try {
    await medicineSearchCache.invalidateAll(tenantId);
    logger.info(`[Worker] Search index synced for tenant ${tenantId}`);
    return { tenantId, status: 'synced' };
  } catch (err) {
    logger.error(`[Worker] Index sync failed: ${err.message}`);
    throw err;
  }
}
