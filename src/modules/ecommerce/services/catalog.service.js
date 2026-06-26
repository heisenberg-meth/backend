import prisma from '../../../config/prisma.js';
import redisClient from '../../../config/redis.js';
import { scanKeys } from '../../../shared/utils/scan-keys.js';

class CatalogService {
  async getPublicCatalog(tenantId, filters = {}) {
    const page = parseInt(filters.page) || 1;
    const limit = parseInt(filters.limit) || 20;
    const { categoryId, search } = filters;
    const cacheKey = `catalog:${tenantId}:${JSON.stringify({ ...filters, page, limit })}`;

    const cached = await redisClient.get(cacheKey);
    if (cached) return JSON.parse(cached);

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
          m.inventoryBatches.reduce((acc, b) => acc + b.availableQuantity, 0) > 0
            ? 'IN_STOCK'
            : 'OUT_OF_STOCK',
        inventoryBatches: undefined,
      })),
      total,
      page,
      pages: Math.ceil(total / limit),
    };

    await redisClient.set(cacheKey, JSON.stringify(result), 'EX', 300);

    return result;
  }

  async invalidateCatalogCache(tenantId) {
    const keys = await scanKeys(`catalog:${tenantId}:*`);
    if (keys.length > 0) {
      await redisClient.del(keys);
    }
  }
}

export default new CatalogService();
