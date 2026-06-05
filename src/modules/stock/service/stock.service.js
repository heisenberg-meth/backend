import movementService from './movement.service.js';
import alertService from './alert.service.js';
import stockRepository from '../repositories/stock.repository.js';
import medicineRepository from '../../inventory/repository/medicine.prisma.repository.js';
import redisClient from '../../../config/redis.js';
import logger from '../../../shared/utils/logger.js';

class StockService {
  async stockIn(tenantId, data, userId) {
    const batch = await movementService.stockIn(tenantId, data, userId);
    await this.invalidateStockCache(tenantId, data.medicineId);
    return batch;
  }

  async stockOut(tenantId, data, userId) {
    const result = await movementService.stockOut(tenantId, data, userId);
    await this.invalidateStockCache(tenantId, data.medicineId);

    // Check for alerts after stock out
    await this.checkAndTriggerAlerts(tenantId, data.medicineId);

    return result;
  }

  async recordDamage(tenantId, data, userId) {
    const record = await movementService.recordDamage(tenantId, data, userId);

    // Get medicineId from batch for alert checking and cache invalidation
    const batch = await stockRepository.findBatchById(data.batchId, tenantId);
    await this.invalidateStockCache(tenantId, batch.medicineId);
    await this.checkAndTriggerAlerts(tenantId, batch.medicineId);

    return record;
  }

  async checkAndTriggerAlerts(tenantId, medicineId) {
    const medicine = await medicineRepository.findById(medicineId, tenantId);
    if (!medicine) return;

    const currentStock = await this.getCurrentStock(tenantId, medicineId);
    const totalQty = currentStock.totalQuantity;

    if (totalQty === 0) {
      await alertService.triggerAlert(
        tenantId,
        medicineId,
        'OUT_OF_STOCK',
        `Medicine ${medicine.name} is out of stock.`,
      );
    } else if (totalQty <= medicine.reorderLevel) {
      await alertService.triggerAlert(
        tenantId,
        medicineId,
        'LOW_STOCK',
        `Medicine ${medicine.name} is low on stock (${totalQty} remaining).`,
      );
    }
  }

  async getCurrentStock(tenantId, medicineId) {
    const cacheKey = `stock:current:${tenantId}:${medicineId}`;
    try {
      const cached = await redisClient.get(cacheKey);
      if (cached) return JSON.parse(cached);
    } catch (err) {
      logger.error('[REDIS ERROR]', err);
    }

    const stock = await stockRepository.getCurrentStock(tenantId, medicineId);

    try {
      await redisClient.set(cacheKey, JSON.stringify(stock), 'EX', 300);
    } catch (err) {
      logger.error('[REDIS ERROR]', err);
    }

    return stock;
  }

  async invalidateStockCache(tenantId, medicineId) {
    try {
      await redisClient.del(`stock:current:${tenantId}:${medicineId}`);
    } catch (err) {
      logger.error('[REDIS ERROR]', err);
    }
  }

  async getDamagedHistory(tenantId, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    return stockRepository.getDamagedHistory(tenantId, skip, limit);
  }
}

export default new StockService();
