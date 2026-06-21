import prisma from '../../../config/prisma.js';
import logger from '../../../shared/utils/logger.js';

class InventoryIntegrityService {
  /**
   * Run startup audit to detect corrupted InventoryBatch records
   */
  async runStartupAudit() {
    try {
      logger.info('Starting Inventory Integrity Audit...');

      const corruptedBatches = await prisma.$queryRaw`
        SELECT
          id,
          "batchNumber",
          quantity,
          "availableQuantity",
          "reservedQuantity"
        FROM "InventoryBatch"
        WHERE "availableQuantity" <> GREATEST(quantity - COALESCE("reservedQuantity", 0), 0)
          AND "deletedAt" IS NULL
      `;

      if (corruptedBatches && corruptedBatches.length > 0) {
        logger.error(
          { corruptedCount: corruptedBatches.length, corruptedBatches },
          'CRITICAL: Inventory corruption detected during startup audit!',
        );
        // Here you could also trigger an external alert (e.g., Slack, Email, PagerDuty)
      } else {
        logger.info('Inventory Integrity Audit passed. No corruption found.');
      }
    } catch (error) {
      logger.error({ error: error.message, stack: error.stack }, 'CRITICAL: Inventory Integrity Audit FAILED — corruption detection disabled');
    }
  }

  /**
   * Reconciliation script to repair corrupted records.
   * Can be exposed via an admin endpoint or run manually.
   */
  async reconcileCorruptedBatches() {
    try {
      logger.warn('Running reconciliation to repair corrupted InventoryBatch records...');
      const result = await prisma.$executeRaw`
        UPDATE "InventoryBatch"
        SET "availableQuantity" = GREATEST(quantity - COALESCE("reservedQuantity", 0), 0)
        WHERE "availableQuantity" <> GREATEST(quantity - COALESCE("reservedQuantity", 0), 0)
      `;
      logger.info({ rowsAffected: result }, 'Reconciliation complete.');
      return result;
    } catch (error) {
      logger.error({ error: error.message }, 'Failed to run reconciliation');
      throw error;
    }
  }
}

export default new InventoryIntegrityService();
