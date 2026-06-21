import redisClient from '../../../config/redis.js';
import supplierRepository from '../repositories/supplier.repository.js';
import logger from '../../../shared/utils/logger.js';

class SupplierService {
  async getSuppliers(tenantId) {
    const cacheKey = `suppliers:${tenantId}`;
    try {
      const cached = await redisClient.get(cacheKey);
      if (cached) return JSON.parse(cached);
    } catch (err) {
      logger.warn('[REDIS ERROR]', err);
    }

    const suppliers = await supplierRepository.findAll(tenantId);

    try {
      await redisClient.set(cacheKey, JSON.stringify(suppliers), 'EX', 3600); // 1 hour
    } catch (err) {
      logger.warn('[REDIS ERROR]', err);
    }

    return suppliers;
  }

  async invalidateCache(tenantId) {
    try {
      await redisClient.del(`suppliers:${tenantId}`);
    } catch (err) {
      logger.warn('[REDIS ERROR]', err);
    }
  }

  async getSupplierById(id, tenantId) {
    const supplier = await supplierRepository.findById(id, tenantId);
    if (!supplier) throw new Error('Supplier not found');
    return supplier;
  }

  async createSupplier(tenantId, data) {
    if (data.gstNumber) {
      const existing = await supplierRepository.findByGst(data.gstNumber, tenantId);
      if (existing) throw new Error('Supplier with this GST number already exists');
    }

    const supplierCode = await supplierRepository.getNextSupplierCode(tenantId);
    const supplier = await supplierRepository.create({ ...data, tenantId, supplierCode });
    await this.invalidateCache(tenantId);
    return supplier;
  }

  async updateSupplier(id, tenantId, data) {
    await this.getSupplierById(id, tenantId);
    const supplier = await supplierRepository.update(id, tenantId, data);
    await this.invalidateCache(tenantId);
    return supplier;
  }

  async deleteSupplier(id, tenantId) {
    await this.getSupplierById(id, tenantId);
    const supplier = await supplierRepository.delete(id, tenantId);
    await this.invalidateCache(tenantId);
    return supplier;
  }
}

export default new SupplierService();
