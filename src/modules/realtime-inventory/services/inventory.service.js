import prisma from '../../../config/prisma.js';
import redisClient from '../../../config/redis.js';
import logger from '../../../shared/utils/logger.js';
import { getIO } from '../../../config/socket.js';
import { inventoryQueue } from '../workers/inventory.worker.js';

class InventoryService {
  /**
   * Record inventory transaction and trigger real-time updates
   */
  async recordTransaction(tx, tenantId, data, userId) {
    const {
      medicineId,
      batchId,
      branchId,
      movementType,
      quantity,
      quantityAfter,
      referenceType,
      referenceId,
      idempotencyKey,
    } = data;

    // Check idempotency
    if (idempotencyKey) {
      const existing = await tx.stockMovement.findUnique({
        where: { idempotencyKey }
      });
      if (existing) return existing;
    }

    // 1. Record to Ledger (StockMovement)
    const ledgerEntry = await tx.stockMovement.create({
      data: {
        tenantId,
        branchId,
        medicineId,
        batchId,
        movementType,
        quantity,
        quantityAfter,
        referenceType,
        referenceId,
        idempotencyKey,
        performedBy: userId
      }
    });

    // 2. Update Redis Cache (Async)
    this.updateCache(tenantId, medicineId, branchId, quantityAfter);

    // 3. Broadcast Real-time event
    this.broadcastUpdate(tenantId, branchId, {
      event: 'STOCK_UPDATED',
      medicineId,
      batchId,
      branchId,
      newQuantity: quantityAfter,
      movementType,
      referenceId
    });

    // 4. Queue Dashboard Refresh (Background)
    inventoryQueue.add('refresh-dashboard', {
      type: 'REFRESH_DASHBOARD',
      tenantId,
      branchId
    }, {
      removeOnComplete: true,
      jobId: `dashboard-refresh:${tenantId}:${branchId || 'global'}`
    }).catch(err => logger.error({ err }, '[INVENTORY_SERVICE] Failed to queue dashboard refresh'));

    return ledgerEntry;
  }

  async updateCache(tenantId, medicineId, branchId, newQuantity) {
    const key = `inventory:${tenantId}:${medicineId}:${branchId || 'central'}`;
    try {
      await redisClient.set(key, newQuantity);
    } catch (err) {
      logger.error({ err }, '[INVENTORY_SERVICE] Redis cache update failed');
    }
  }

  broadcastUpdate(tenantId, branchId, payload) {
    try {
      const io = getIO();
      // Broadcast to tenant room
      io.to(`tenant:${tenantId}`).emit('INVENTORY_UPDATE', payload);
      
      // If branch specific, broadcast to branch room too
      if (branchId) {
        io.to(`branch:${branchId}`).emit('INVENTORY_UPDATE', payload);
      }
    } catch (err) {
      logger.error({ err }, '[INVENTORY_SERVICE] WebSocket broadcast failed');
    }
  }

  async getLiveStock(tenantId, medicineId, branchId) {
    const key = `inventory:${tenantId}:${medicineId}:${branchId || 'central'}`;
    let stock = await redisClient.get(key);

    if (stock === null) {
      // Cache miss, fetch from DB
      const batchSum = await prisma.inventoryBatch.aggregate({
        where: {
          medicineId,
          branchId,
          deletedAt: null,
          status: 'ACTIVE'
        },
        _sum: {
          quantity: true
        }
      });
      stock = batchSum._sum.quantity || 0;
      await this.updateCache(tenantId, medicineId, branchId, stock);
    }

    return parseInt(stock);
  }
}

export default new InventoryService();
