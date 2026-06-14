import prisma from '../../../config/prisma.js';
import stockService from '../service/stock.service.js';
import ledgerService from '../service/ledger.service.js';
import alertService from '../service/alert.service.js';
import analyticsService from '../../analytics/service/analytics.service.js';

class StockFastifyController {
  async stockIn(request, reply) {
    const data = {
      ...request.body,
      branchId: request.body.branchId || request.branchId,
    };
    const batch = await stockService.stockIn(request.tenantId, data, request.user.id);
    return reply.code(201).send(batch);
  }

  async stockOut(request, reply) {
    const data = {
      ...request.body,
      branchId: request.body.branchId || request.branchId,
    };
    const result = await stockService.stockOut(request.tenantId, data, request.user.id);
    return reply.send(result);
  }

  async recordDamage(request, reply) {
    const data = {
      ...request.body,
      branchId: request.body.branchId || request.branchId,
    };
    const record = await stockService.recordDamage(request.tenantId, data, request.user.id);
    return reply.code(201).send(record);
  }

  async getHistory(request, reply) {
    const { medicineId, page, limit } = request.query;
    const history = await ledgerService.getTransactionHistory(
      request.tenantId,
      medicineId,
      parseInt(page) || 1,
      parseInt(limit) || 20,
    );
    return reply.send(history);
  }

  async getAlerts(request, reply) {
    const tenantId = request.tenantId;

    const thirtyDaysFromNow = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    const [kpis, lowStockRaw, expiringSoon, outOfStock] = await Promise.all([
      analyticsService.getTenantKPIs(tenantId),
      prisma.$queryRaw`
        SELECT i."medicineId", i."currentStock", i."reorderPoint", m."name", m."genericName"
        FROM "Inventory" i
        JOIN "Medicine" m ON m."id" = i."medicineId"
        WHERE i."tenantId" = ${tenantId}
          AND i."currentStock" > 0
          AND i."currentStock" <= i."reorderPoint"
        ORDER BY (i."reorderPoint" - i."currentStock") DESC
      `,
      prisma.inventoryBatch.findMany({
        where: {
          tenantId,
          expiryDate: { lte: thirtyDaysFromNow, gt: new Date() },
          quantity: { gt: 0 },
          status: 'ACTIVE',
          deletedAt: null,
        },
        include: { medicine: { select: { id: true, name: true, genericName: true } } },
        orderBy: { expiryDate: 'asc' },
      }),
      prisma.inventory.findMany({
        where: { tenantId, currentStock: 0 },
        include: { medicine: { select: { id: true, name: true, genericName: true } } },
      }),
    ]);

    return reply.send({
      success: true,
      data: {
        lowStockCount: kpis.lowStock,
        expiringSoonCount: kpis.expiring30Days,
        lowStock: lowStockRaw.map((inv) => ({
          medicineId: inv.medicineId,
          name: inv.name,
          currentStock: inv.currentStock,
          reorderPoint: inv.reorderPoint,
        })),
        expiringSoon: expiringSoon.map((batch) => ({
          medicineId: batch.medicineId,
          batchNumber: batch.batchNumber,
          expiryDate: batch.expiryDate,
          daysRemaining: Math.ceil(
            (new Date(batch.expiryDate) - new Date()) / (1000 * 60 * 60 * 24),
          ),
          name: batch.medicine.name,
        })),
        outOfStock: outOfStock.map((inv) => ({
          medicineId: inv.medicineId,
          name: inv.medicine.name,
        })),
      },
    });
  }

  async resolveAlert(request, reply) {
    await alertService.resolveAlert(request.params.id, request.tenantId);
    return reply.send({ message: 'Alert resolved' });
  }

  async getCurrentStock(request, reply) {
    const stock = await stockService.getCurrentStock(request.tenantId, request.params.medicineId);
    return reply.send(stock);
  }
}

export default new StockFastifyController();
