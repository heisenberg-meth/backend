import prisma from '../../../config/prisma.js';
import redisClient from '../../../config/redis.js';
import logger from '../../../shared/utils/logger.js';
import { getIO } from '../../../config/socket.js';
import { inventoryQueue } from '../workers/inventory.worker.js';

export class InventoryService {
  constructor(deps = {}) {
    this.prisma = deps.prisma || prisma;
    this.redis = deps.redis || redisClient;
    this.logger = deps.logger || logger;
    this.getIO = deps.getIO || getIO;
    this.inventoryQueue = deps.inventoryQueue !== undefined ? deps.inventoryQueue : inventoryQueue;
  }

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

    if (idempotencyKey) {
      const existing = await tx.stockMovement.findUnique({
        where: { idempotencyKey }
      });
      if (existing) return existing;
    }

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

    this.updateCache(tenantId, medicineId, branchId, quantityAfter);

    this.broadcastUpdate(tenantId, branchId, {
      event: 'STOCK_UPDATED',
      medicineId,
      batchId,
      branchId,
      newQuantity: quantityAfter,
      movementType,
      referenceId
    });

    if (this.inventoryQueue) {
      this.inventoryQueue.add('refresh-dashboard', {
        type: 'REFRESH_DASHBOARD',
        tenantId,
        branchId
      }, {
        removeOnComplete: true,
        jobId: `dashboard-refresh:${tenantId}:${branchId || 'global'}`
      }).catch(err => this.logger.error({ err }, '[INVENTORY_SERVICE] Failed to queue dashboard refresh'));
    }

    return ledgerEntry;
  }

  async updateCache(tenantId, medicineId, branchId, newQuantity) {
    const key = `inventory:${tenantId}:${medicineId}:${branchId || 'central'}`;
    try {
      await this.redis.set(key, newQuantity);
    } catch (err) {
      this.logger.error({ err }, '[INVENTORY_SERVICE] Redis cache update failed');
    }
  }

  broadcastUpdate(tenantId, branchId, payload) {
    try {
      const io = this.getIO();
      io.to(`tenant:${tenantId}`).emit('INVENTORY_UPDATE', payload);
      
      if (branchId) {
        io.to(`branch:${branchId}`).emit('INVENTORY_UPDATE', payload);
      }
    } catch (err) {
      this.logger.error({ err }, '[INVENTORY_SERVICE] WebSocket broadcast failed');
    }
  }

  async getLiveStock(tenantId, medicineId, branchId) {
    const key = `inventory:${tenantId}:${medicineId}:${branchId || 'central'}`;
    let stock = await this.redis.get(key);

    if (stock === null) {
      const batchSum = await this.prisma.inventoryBatch.aggregate({
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
