import prisma from '../../../config/prisma.js';
import redisClient from '../../../config/redis.js';
import { scanKeys } from '../../../shared/utils/scan-keys.js';

class CatalogService {
  /**
   * Gets public medicine catalog with caching.
   */
  async getPublicCatalog(tenantId, filters = {}) {
    const { categoryId, search, page = 1, limit = 20 } = filters;
    const cacheKey = `catalog:${tenantId}:${JSON.stringify(filters)}`;

    // 1. Try Cache
    const cached = await redisClient.get(cacheKey);
    if (cached) return JSON.parse(cached);

    // 2. Query DB
    const where = {
      tenantId,
      isPublished: true,
      isActive: true,
      deletedAt: null,
    };

    if (categoryId) where.categoryId = categoryId;
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { genericName: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [medicines, total] = await Promise.all([
      prisma.medicine.findMany({
        where,
        select: {
          id: true,
          name: true,
          genericName: true,
          dosageForm: true,
          strength: true,
          sellingPrice: true,
          storefrontPrice: true,
          description: true,
          onlineDescription: true,
          prescriptionRequired: true,
          category: { select: { name: true } },
          manufacturer: { select: { name: true } },
          // Filtered stock status (not exact numbers for security)
          inventoryBatches: {
            where: { status: 'ACTIVE', deletedAt: null },
            select: { quantity: true, reservedQuantity: true },
          },
        },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.medicine.count({ where }),
    ]);

    const result = {
      medicines: medicines.map((m) => ({
        ...m,
        stockStatus:
          m.inventoryBatches.reduce((acc, b) => acc + (b.quantity - b.reservedQuantity), 0) > 0
            ? 'IN_STOCK'
            : 'OUT_OF_STOCK',
        inventoryBatches: undefined, // Remove internal batch details
      })),
      total,
      page,
      pages: Math.ceil(total / limit),
    };

    // 3. Set Cache (5 minutes)
    await redisClient.set(cacheKey, JSON.stringify(result), 'EX', 300);

    return result;
  }

  /**
   * Invalidates catalog cache for a tenant.
   */
  async invalidateCatalogCache(tenantId) {
    const keys = await scanKeys(`catalog:${tenantId}:*`);
    if (keys.length > 0) {
      await redisClient.del(keys);
    }
  }
}

export default new CatalogService();
