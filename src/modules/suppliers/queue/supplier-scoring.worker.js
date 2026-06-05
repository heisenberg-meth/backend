import { Worker } from 'bullmq';
import prisma from '../../../config/prisma.js';
import { PURCHASE_ORDER_STATUS } from '../../../shared/constants/purchase-order-status.js';
import { getBullRedis } from '../../../config/redis.js';
import { registerWorker } from '../../../config/queue-registry.js';
import { DOMAIN_EVENTS } from '../../../shared/constants/events.js';
import { emitLocalEvent } from '../../../shared/events/local-event-bus.js';
import { SUPPLIER_SCORING_QUEUE, JOB_TYPES } from './supplier-scoring.queue.js';
import logger from '../../../shared/utils/logger.js';

const isTest = process.env.NODE_ENV === 'test';

if (!isTest) {
  registerWorker(
    new Worker(
      SUPPLIER_SCORING_QUEUE,
      async (job) => {
        const { supplierId, tenantId } = job.data || {};

        switch (job.name) {
          case JOB_TYPES.SCORE_ALL_SUPPLIERS:
            await scoreAllSuppliers();
            break;

          case JOB_TYPES.SCORE_SINGLE_SUPPLIER:
            if (supplierId && tenantId) {
              await scoreSingleSupplier(supplierId, tenantId);
            }
            break;

          case JOB_TYPES.DAILY_SCORING_SWEEP:
            await scoreAllSuppliers();
            break;

          default:
            logger.warn({ jobName: job.name }, 'Unknown supplier scoring job type');
        }
      },
      {
        connection: getBullRedis(),
        concurrency: 3,
      },
    ),
  );

  logger.info('[SUPPLIER-SCORING-WORKER] Initialized supplier scoring worker');
}

async function scoreAllSuppliers() {
  logger.info('[SUPPLIER-SCORING] Starting batch supplier scoring');

  const suppliers = await prisma.supplier.findMany({
    where: { deletedAt: null, status: { not: 'ARCHIVED' } },
    select: { id: true, tenantId: true },
  });

  logger.info({ count: suppliers.length }, '[SUPPLIER-SCORING] Scoring suppliers');

  for (const supplier of suppliers) {
    try {
      await scoreSingleSupplier(supplier.id, supplier.tenantId);
    } catch (err) {
      logger.error({ err, supplierId: supplier.id }, '[SUPPLIER-SCORING] Failed to score supplier');
    }
  }

  logger.info('[SUPPLIER-SCORING] Batch scoring complete');
}

async function scoreSingleSupplier(supplierId, tenantId) {
  const [metrics, grnStats, orders] = await Promise.all([
    prisma.supplierMetrics.findUnique({ where: { supplierId } }),
    prisma.goodsReceiptNote.aggregate({
      where: { tenantId, purchaseOrder: { supplierId } },
      _count: { id: true },
    }),
    prisma.purchaseOrder.findMany({
      where: { supplierId, tenantId, status: PURCHASE_ORDER_STATUS.RECEIVED },
      select: { totalAmount: true, createdAt: true, expectedDeliveryDate: true, approvedAt: true },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
  ]);

  if (!metrics) {
    await prisma.supplierMetrics.create({
      data: { supplierId },
    });
  }

  const totalReceived = grnStats._count.id || 0;
  const totalOrders = orders.length;

  let onTimeCount = 0;
  let totalLeadTime = 0;
  let lateDeliveries = 0;
  const now = new Date();

  orders.forEach((order) => {
    if (order.expectedDeliveryDate) {
      if (order.approvedAt) {
        const leadTime = Math.max(
          0,
          Math.floor((order.expectedDeliveryDate - order.approvedAt) / (1000 * 60 * 60 * 24)),
        );
        totalLeadTime += leadTime;
      }
      if (order.expectedDeliveryDate >= order.createdAt) {
        onTimeCount++;
      } else {
        lateDeliveries++;
      }
    }
  });

  const deliveryAccuracy = totalOrders > 0 ? (onTimeCount / totalOrders) * 100 : 100;
  const averageLeadTime = totalOrders > 0 ? totalLeadTime / totalOrders : 0;

  const rejections = await prisma.supplierReturn.count({
    where: { supplierId, tenantId },
  });
  const rejectionRate = totalReceived > 0 ? (rejections / totalReceived) * 100 : 0;

  const damagedStock = await prisma.damagedStock.count({
    where: { tenantId, batch: { supplierId } },
  });
  const damageRate = totalOrders > 0 ? (damagedStock / totalOrders) * 100 : 0;

  const nearExpiryCount = await prisma.inventoryBatch.count({
    where: {
      supplierId,
      tenantId,
      expiryDate: { lte: new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000), gte: now },
    },
  });
  const totalBatches = await prisma.inventoryBatch.count({
    where: { supplierId, tenantId },
  });
  const expiryIssuePct = totalBatches > 0 ? (nearExpiryCount / totalBatches) * 100 : 0;

  const qualityScore = Math.max(0, 100 - rejectionRate * 2 - damageRate * 3);
  const reliabilityScore = Math.max(0, deliveryAccuracy);

  const leadTimeReliability = Math.max(0, 100 - (lateDeliveries / Math.max(totalOrders, 1)) * 50);

  const overallScore = parseFloat(
    ((deliveryAccuracy + qualityScore + leadTimeReliability) / 30).toFixed(1),
  );

  const avgShelfLife = await _calculateAvgShelfLife(supplierId, tenantId);

  await prisma.supplierMetrics.upsert({
    where: { supplierId },
    update: {
      totalOrders,
      onTimeDeliveries: onTimeCount,
      averageDeliveryDays: averageLeadTime,
      qualityScore,
      reliabilityScore,
      returnPercentage: parseFloat(rejectionRate.toFixed(1)),
      expiryIssuePercentage: parseFloat(expiryIssuePct.toFixed(1)),
      fulfillmentRate: deliveryAccuracy,
      rejectionRate: parseFloat(rejectionRate.toFixed(1)),
      avgExpiryShelfLife: avgShelfLife,
      pricingStabilityScore: await _calculatePricingStability(supplierId, tenantId),
    },
    create: {
      supplierId,
      totalOrders,
      onTimeDeliveries: onTimeCount,
      averageDeliveryDays: averageLeadTime,
      qualityScore,
      reliabilityScore,
      returnPercentage: parseFloat(rejectionRate.toFixed(1)),
      expiryIssuePercentage: parseFloat(expiryIssuePct.toFixed(1)),
      fulfillmentRate: deliveryAccuracy,
      rejectionRate: parseFloat(rejectionRate.toFixed(1)),
      avgExpiryShelfLife: avgShelfLife,
      pricingStabilityScore: 100,
    },
  });

  const purchaseTotal = orders.reduce((sum, o) => sum + o.totalAmount, 0);
  await prisma.supplier.update({
    where: { id: supplierId },
    data: {
      rating: overallScore,
      totalPurchases: purchaseTotal,
    },
  });

  emitLocalEvent(DOMAIN_EVENTS.SUPPLIER_SCORE_UPDATED, {
    supplierId,
    tenantId,
    overallScore,
    deliveryAccuracy,
    qualityScore,
  });
}

async function _calculateAvgShelfLife(supplierId, tenantId) {
  const recentBatches = await prisma.inventoryBatch.findMany({
    where: { supplierId, tenantId },
    select: { expiryDate: true, receivedDate: true },
    orderBy: { receivedDate: 'desc' },
    take: 20,
  });

  if (recentBatches.length === 0) return 0;

  const totalShelfLife = recentBatches.reduce((sum, batch) => {
    if (batch.expiryDate && batch.receivedDate) {
      const shelfLife = Math.floor((batch.expiryDate - batch.receivedDate) / (1000 * 60 * 60 * 24));
      return sum + Math.max(0, shelfLife);
    }
    return sum;
  }, 0);

  return Math.round(totalShelfLife / recentBatches.length);
}

async function _calculatePricingStability(supplierId, tenantId) {
  const recentItems = await prisma.purchaseOrderItem.findMany({
    where: {
      purchaseOrder: { supplierId, tenantId, status: PURCHASE_ORDER_STATUS.RECEIVED },
    },
    select: { unitPrice: true, medicineId: true },
    orderBy: { purchaseOrder: { createdAt: 'desc' } },
    take: 100,
  });

  if (recentItems.length < 5) return 100;

  const medPrices = {};
  recentItems.forEach((item) => {
    if (!medPrices[item.medicineId]) medPrices[item.medicineId] = [];
    medPrices[item.medicineId].push(item.unitPrice);
  });

  let totalVariance = 0;
  let medicineCount = 0;

  Object.values(medPrices).forEach((prices) => {
    if (prices.length < 2) return;
    const avg = prices.reduce((s, p) => s + p, 0) / prices.length;
    const variance = prices.reduce((s, p) => s + Math.pow(p - avg, 2), 0) / prices.length;
    const cv = (Math.sqrt(variance) / avg) * 100;
    totalVariance += cv;
    medicineCount++;
  });

  if (medicineCount === 0) return 100;

  const avgCv = totalVariance / medicineCount;
  return Math.max(0, Math.min(100, 100 - avgCv));
}
