import prisma from '../../../config/prisma.js';
import { initRedis } from '../../../config/redis.js';
import { emitEvent } from '../../../shared/events/erp-event-bus.js';
import { DOMAIN_EVENTS } from '../../../shared/constants/events.js';
import kpiService from './analytics.service.js';
import logger from '../../../shared/utils/logger.js';

const redisClient = initRedis();

class AnalyticsPrismaService {
  async getDashboardStats(tenantId) {
    const cacheKey = `stats:dashboard:${tenantId}`;

    const cachedStats = await redisClient.get(cacheKey);
    if (cachedStats) {
      return JSON.parse(cachedStats);
    }

    const [kpis, transactions, outstandingPayables, paidPurchases, pendingPayments] =
      await Promise.all([
        kpiService.getTenantKPIs(tenantId),
        prisma.transaction.aggregate({
          where: { tenantId, status: 'SUCCESS' },
          _sum: { amount: true },
        }),
        prisma.purchaseInvoice.aggregate({
          where: { tenantId, paymentStatus: { not: 'PAID' } },
          _sum: { balanceAmount: true },
        }),
        prisma.purchaseInvoice.aggregate({
          where: { tenantId, paymentStatus: 'PAID' },
          _sum: { totalAmount: true },
        }),
        prisma.purchaseInvoice.count({
          where: { tenantId, paymentStatus: 'PENDING' },
        }),
      ]);

    const stats = {
      totalMedicines: kpis.totalSku,
      lowStockCount: kpis.lowStock,
      outOfStockCount: 0,
      totalRevenue: transactions._sum.amount || 0,
      outstandingSupplierPayables: Number(outstandingPayables._sum.balanceAmount) || 0,
      paidPurchasesThisMonth: Number(paidPurchases._sum.totalAmount) || 0,
      pendingSupplierPayments: pendingPayments,
      timestamp: new Date(),
    };

    await redisClient.set(cacheKey, JSON.stringify(stats), 'EX', 300);

    return stats;
  }

  async getInventoryDistribution(tenantId) {
    const distribution = await prisma.inventoryBatch.groupBy({
      by: ['supplierId'],
      where: {
        medicine: { tenantId },
        deletedAt: null,
      },
      _count: { id: true },
      _sum: { availableQuantity: true },
    });
    return distribution;
  }

  async getRevenueVsCost(tenantId) {
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setFullYear(twelveMonthsAgo.getFullYear() - 1);

    const revenueByMonth = await prisma.$queryRaw`
      SELECT
        DATE_TRUNC('month', "soldAt") as month,
        SUM("totalAmount") as revenue
      FROM "Sale"
      WHERE "tenantId" = ${tenantId}
        AND "soldAt" >= ${twelveMonthsAgo}
      GROUP BY DATE_TRUNC('month', "soldAt")
      ORDER BY month ASC
    `;

    const cogsByMonth = await prisma.$queryRaw`
      SELECT
        DATE_TRUNC('month', s."soldAt") as month,
        COALESCE(SUM(si.quantity * COALESCE(ib."purchasePrice", 0)), 0) as cogs
      FROM "SaleItem" si
      JOIN "Sale" s ON s.id = si."saleId"
      LEFT JOIN "InventoryBatch" ib ON ib.id = si."batchId"
      WHERE s."tenantId" = ${tenantId}
        AND s."soldAt" >= ${twelveMonthsAgo}
      GROUP BY DATE_TRUNC('month', s."soldAt")
      ORDER BY month ASC
    `;

    const revenueMap = {};
    for (const r of revenueByMonth) {
      const key = r.month.toISOString().slice(0, 7);
      revenueMap[key] = Number(r.revenue) || 0;
    }

    const cogsMap = {};
    for (const c of cogsByMonth) {
      const key = c.month.toISOString().slice(0, 7);
      cogsMap[key] = Number(c.cogs) || 0;
    }

    const months = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const key = d.toISOString().slice(0, 7);
      months.push({
        month: key,
        revenue: revenueMap[key] || 0,
        cogs: cogsMap[key] || 0,
        profit: (revenueMap[key] || 0) - (cogsMap[key] || 0),
      });
    }

    return months;
  }

  async getSupplierSpend(tenantId) {
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setFullYear(twelveMonthsAgo.getFullYear() - 1);

    const spend = await prisma.$queryRaw`
      SELECT
        s.id as "supplierId",
        s.name as "supplierName",
        COALESCE(SUM(pi."totalAmount"), 0) as totalSpend,
        COUNT(pi.id) as invoiceCount,
        MAX(pi."invoiceDate") as "lastPurchaseDate"
      FROM "Supplier" s
      LEFT JOIN "PurchaseInvoice" pi ON pi."supplierId" = s.id
        AND pi."invoiceDate" >= ${twelveMonthsAgo}
      WHERE s."tenantId" = ${tenantId}
        AND s."deletedAt" IS NULL
      GROUP BY s.id, s.name
      ORDER BY totalSpend DESC
    `;

    const suppliers = spend.map((s) => ({
      supplierId: s.supplierId,
      supplierName: s.supplierName,
      totalSpend: Number(s.totalSpend) || 0,
      invoiceCount: Number(s.invoiceCount) || 0,
      lastPurchaseDate: s.lastPurchaseDate,
    }));

    const totalSpendAll = suppliers.reduce((sum, s) => sum + s.totalSpend, 0);
    let concentrationRisk = null;

    if (totalSpendAll > 0 && suppliers.length > 0) {
      const topSupplierShare = (suppliers[0].totalSpend / totalSpendAll) * 100;
      if (topSupplierShare > 80) {
        concentrationRisk = {
          riskLevel: 'CRITICAL',
          topSupplier: suppliers[0].supplierName,
          topSupplierShare: Math.round(topSupplierShare * 100) / 100,
          message: `${suppliers[0].supplierName} accounts for ${Math.round(topSupplierShare)}% of procurement — dangerous single-supplier dependency`,
        };

        emitEvent(DOMAIN_EVENTS.SUPPLIER_CONCENTRATION_RISK, {
          tenantId,
          supplierId: suppliers[0].supplierId,
          supplierName: suppliers[0].supplierName,
          share: topSupplierShare,
        }).catch((err) =>
          logger.warn({ err, tenantId }, 'Failed to emit supplier concentration risk event'),
        );
      } else if (topSupplierShare > 50) {
        concentrationRisk = {
          riskLevel: 'WARNING',
          topSupplier: suppliers[0].supplierName,
          topSupplierShare: Math.round(topSupplierShare * 100) / 100,
          message: `${suppliers[0].supplierName} accounts for ${Math.round(topSupplierShare)}% of procurement — consider diversifying suppliers`,
        };
      }
    }

    return {
      suppliers,
      concentrationRisk,
      totalSpend: totalSpendAll,
      supplierCount: suppliers.length,
    };
  }

  async getLowStockTrends(tenantId) {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const snapshots = await prisma.stockSnapshot.findMany({
      where: { tenantId, snapshotDate: { gte: thirtyDaysAgo } },
      orderBy: { snapshotDate: 'asc' },
    });

    const dailyCounts = {};
    for (const snap of snapshots) {
      const key = snap.snapshotDate.toISOString().slice(0, 10);
      if (!dailyCounts[key]) dailyCounts[key] = { total: 0, lowStock: 0 };
      dailyCounts[key].total++;
      if (snap.closingStock > 0 && snap.closingStock <= 10) dailyCounts[key].lowStock++;
    }

    const trends = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      trends.push({
        date: key,
        lowStockCount: dailyCounts[key]?.lowStock || 0,
        totalMedicines: dailyCounts[key]?.total || 0,
      });
    }

    return trends;
  }

  async getSlowMovingStock(tenantId) {
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const soldMedicineIds = await prisma.saleItem.findMany({
      where: {
        sale: { tenantId, soldAt: { gte: ninetyDaysAgo } },
      },
      select: { medicineId: true },
      distinct: ['medicineId'],
    });

    const soldIds = new Set(soldMedicineIds.map((s) => s.medicineId));

    const allMedicines = await prisma.medicine.findMany({
      where: { tenantId, deletedAt: null, isActive: true },
      include: {
        inventoryBatches: {
          where: { deletedAt: null, status: 'ACTIVE' },
          select: { availableQuantity: true },
        },
      },
    });

    return allMedicines
      .filter((m) => !soldIds.has(m.id))
      .map((m) => {
        const totalQuantity = m.inventoryBatches.reduce((sum, b) => sum + b.availableQuantity, 0);
        return {
          medicineId: m.id,
          name: m.name,
          currentStock: totalQuantity,
          sellingPrice: m.sellingPrice,
          reorderLevel: m.reorderLevel,
        };
      });
  }

  async getTopSellingMedicines(tenantId) {
    const topByRevenue = await prisma.saleItem.groupBy({
      by: ['medicineId'],
      where: { sale: { tenantId } },
      _sum: { totalAmount: true, quantity: true },
      orderBy: { _sum: { totalAmount: 'desc' } },
      take: 10,
    });

    const medicineIds = topByRevenue.map((s) => s.medicineId);
    const medicines = medicineIds.length
      ? await prisma.medicine.findMany({
          where: { id: { in: medicineIds }, tenantId },
          select: { id: true, name: true },
        })
      : [];
    const medMap = {};
    for (const m of medicines) medMap[m.id] = m.name;

    return topByRevenue.map((s) => ({
      medicineId: s.medicineId,
      name: medMap[s.medicineId] || 'Unknown',
      totalRevenue: s._sum.totalAmount || 0,
      totalQuantity: s._sum.quantity || 0,
    }));
  }

  async getExpiryLossReport(tenantId) {
    const now = new Date();

    const expiredBatches = await prisma.inventoryBatch.findMany({
      where: {
        medicine: { tenantId, deletedAt: null },
        OR: [{ expiryDate: { lt: now } }, { status: 'EXPIRED' }],
        availableQuantity: { gt: 0 },
        deletedAt: null,
      },
      select: {
        id: true,
        batchNumber: true,
        availableQuantity: true,
        purchasePrice: true,
        sellingPrice: true,
        expiryDate: true,
        supplierId: true,
        medicine: { select: { id: true, name: true } },
      },
    });

    const totalValue = expiredBatches.reduce(
      (sum, b) => sum + b.availableQuantity * b.purchasePrice,
      0,
    );
    const totalRevenue = expiredBatches.reduce(
      (sum, b) => sum + b.availableQuantity * b.sellingPrice,
      0,
    );

    const supplierExpiryMap = {};
    for (const b of expiredBatches) {
      if (b.supplierId) {
        if (!supplierExpiryMap[b.supplierId]) {
          supplierExpiryMap[b.supplierId] = {
            supplierId: b.supplierId,
            expiredValue: 0,
            expiredQuantity: 0,
            batchCount: 0,
          };
        }
        supplierExpiryMap[b.supplierId].expiredValue += b.availableQuantity * b.purchasePrice;
        supplierExpiryMap[b.supplierId].expiredQuantity += b.availableQuantity;
        supplierExpiryMap[b.supplierId].batchCount += 1;
      }
    }

    const supplierIds = Object.keys(supplierExpiryMap);
    let supplierExpiryData = [];
    if (supplierIds.length > 0) {
      const suppliers = await prisma.supplier.findMany({
        where: { id: { in: supplierIds }, tenantId },
        select: { id: true, name: true },
      });
      const supplierNameMap = {};
      for (const s of suppliers) supplierNameMap[s.id] = s.name;

      supplierExpiryData = Object.values(supplierExpiryMap)
        .map((s) => ({
          supplierId: s.supplierId,
          supplierName: supplierNameMap[s.supplierId] || 'Unknown',
          expiredValue: Math.round(s.expiredValue * 100) / 100,
          expiredQuantity: s.expiredQuantity,
          batchCount: s.batchCount,
        }))
        .sort((a, b) => b.expiredValue - a.expiredValue);
    }

    return {
      totalLossValue: totalValue,
      totalLostRevenue: totalRevenue,
      totalItems: expiredBatches.reduce((sum, b) => sum + b.availableQuantity, 0),
      itemCount: expiredBatches.length,
      expiryLossPercentage:
        totalValue > 0 ? Math.round((totalValue / (totalValue + totalRevenue)) * 10000) / 100 : 0,
      supplierExpiryAnalysis: supplierExpiryData,
      items: expiredBatches.map((b) => ({
        medicineId: b.medicine.id,
        medicineName: b.medicine.name,
        batchNumber: b.batchNumber,
        quantity: b.availableQuantity,
        purchasePrice: b.purchasePrice,
        sellingPrice: b.sellingPrice,
        lossValue: b.availableQuantity * b.purchasePrice,
        expiryDate: b.expiryDate,
        supplierId: b.supplierId,
      })),
    };
  }

  async getProfitMargin(tenantId) {
    const batches = await prisma.inventoryBatch.findMany({
      where: {
        medicine: { tenantId, deletedAt: null },
        deletedAt: null,
        purchasePrice: { gt: 0 },
        sellingPrice: { gt: 0 },
      },
      select: {
        id: true,
        purchasePrice: true,
        sellingPrice: true,
        availableQuantity: true,
        medicine: { select: { id: true, name: true } },
      },
    });

    if (batches.length === 0) {
      return {
        averageMargin: 0,
        totalPotentialProfit: 0,
        batchCount: 0,
        negativeMarginCount: 0,
        negativeMarginItems: [],
      };
    }

    let totalMarginPct = 0;
    let totalPotentialProfit = 0;
    let totalQty = 0;
    let negativeMarginCount = 0;
    const negativeMarginItems = [];
    const marginRanges = {
      below10: 0,
      between10and20: 0,
      between20and30: 0,
      above30: 0,
    };

    for (const b of batches) {
      const margin =
        b.sellingPrice > 0 ? ((b.sellingPrice - b.purchasePrice) / b.sellingPrice) * 100 : 0;
      totalMarginPct += margin * b.availableQuantity;
      totalPotentialProfit += (b.sellingPrice - b.purchasePrice) * b.availableQuantity;
      totalQty += b.availableQuantity;

      if (margin < 0) {
        negativeMarginCount += b.availableQuantity;
        const flagReason =
          margin < -10 ? 'CRITICAL - Likely pricing error' : 'NEGATIVE - Selling below cost';
        if (b.availableQuantity > 0) {
          negativeMarginItems.push({
            medicineId: b.medicine.id,
            medicineName: b.medicine.name,
            purchasePrice: b.purchasePrice,
            sellingPrice: b.sellingPrice,
            margin: Math.round(margin * 100) / 100,
            flag: flagReason,
          });
        }
      } else if (margin <= 10) {
        marginRanges.below10 += b.availableQuantity;
      } else if (margin <= 20) {
        marginRanges.between10and20 += b.availableQuantity;
      } else if (margin <= 30) {
        marginRanges.between20and30 += b.availableQuantity;
      } else {
        marginRanges.above30 += b.availableQuantity;
      }
    }

    if (negativeMarginItems.length > 0) {
      emitEvent(DOMAIN_EVENTS.PROFIT_MARGIN_ALERT, {
        tenantId,
        negativeCount: negativeMarginCount,
        items: negativeMarginItems.map((i) => ({
          medicineId: i.medicineId,
          medicineName: i.medicineName,
          margin: i.margin,
        })),
      }).catch((err) => logger.warn({ err, tenantId }, 'Failed to emit profit margin alert event'));
    }

    return {
      averageMargin: totalQty > 0 ? Math.round((totalMarginPct / totalQty) * 100) / 100 : 0,
      totalPotentialProfit: Math.round(totalPotentialProfit * 100) / 100,
      batchCount: batches.length,
      negativeMarginCount,
      negativeMarginWarning:
        negativeMarginItems.length > 0
          ? `${negativeMarginItems.length} items are being sold below cost — possible pricing errors or discount abuse`
          : null,
      negativeMarginItems: negativeMarginItems.slice(0, 20),
      marginDistribution: {
        below10Pct: Math.round((marginRanges.below10 / totalQty) * 10000) / 100,
        between10And20Pct: Math.round((marginRanges.between10and20 / totalQty) * 10000) / 100,
        between20And30Pct: Math.round((marginRanges.between20and30 / totalQty) * 10000) / 100,
        above30Pct: Math.round((marginRanges.above30 / totalQty) * 10000) / 100,
      },
    };
  }

  async getStaffSales(tenantId) {
    const salesByStaff = await prisma.$queryRaw`
      SELECT
        u.id as "userId",
        u."fullName" as "staffName",
        u.role,
        COUNT(s.id) as saleCount,
        COALESCE(SUM(s."totalAmount"), 0) as totalSales,
        COALESCE(AVG(s."totalAmount"), 0) as avgSaleValue,
        MIN(s."soldAt") as "firstSale",
        MAX(s."soldAt") as "lastSale"
      FROM "User" u
      LEFT JOIN "Sale" s ON s."soldBy" = u.id
        AND s."tenantId" = ${tenantId}
      WHERE u."tenantId" = ${tenantId}
        AND u."deletedAt" IS NULL
      GROUP BY u.id, u."fullName", u.role
      ORDER BY totalSales DESC
    `;

    return salesByStaff.map((s) => ({
      userId: s.userId,
      staffName: s.staffName,
      role: s.role,
      saleCount: Number(s.saleCount) || 0,
      totalSales: Number(s.totalSales) || 0,
      avgSaleValue: Number(s.avgSaleValue) || 0,
      firstSale: s.firstSale,
      lastSale: s.lastSale,
    }));
  }

  async getPaymentMethods(tenantId) {
    const breakdown = await prisma.sale.groupBy({
      by: ['paymentMethod'],
      where: { tenantId },
      _sum: { totalAmount: true },
      _count: { id: true },
      _avg: { totalAmount: true },
    });

    const totalRevenue = breakdown.reduce((sum, b) => sum + (b._sum.totalAmount || 0), 0);
    const totalCount = breakdown.reduce((sum, b) => sum + (b._count.id || 0), 0);

    return {
      totalRevenue,
      totalTransactions: totalCount,
      breakdown: breakdown.map((b) => ({
        method: b.paymentMethod,
        total: b._sum.totalAmount || 0,
        count: b._count.id || 0,
        percentage:
          totalRevenue > 0
            ? Math.round(((b._sum.totalAmount || 0) / totalRevenue) * 10000) / 100
            : 0,
        avgTransaction: b._avg.totalAmount || 0,
      })),
    };
  }

  async getFraudSignals(tenantId) {
    const cacheKey = `analytics:fraud-signals:${tenantId}`;
    const cached = await redisClient.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const [highRefundStaff, cashSpikeDays, abnormalDiscounts, highReturnCustomers, priceAnomalies] =
      await Promise.all([
        prisma.$queryRaw`
        SELECT
          u.id as "userId",
          u."fullName" as "staffName",
          COUNT(r.id) as refundCount,
          COALESCE(SUM(r."totalReturnAmount"), 0) as refundAmount,
          COALESCE(SUM(r."totalReturnAmount") / NULLIF(COUNT(r.id), 0), 0) as avgRefundValue
        FROM "Return" r
        JOIN "User" u ON u.id = r."createdBy"
        WHERE r."tenantId" = ${tenantId}
          AND r."createdAt" >= ${ninetyDaysAgo}
        GROUP BY u.id, u."fullName"
        HAVING COUNT(r.id) > (
          SELECT AVG(rc.cnt) + 2 * STDDEV(rc.cnt) FROM (
            SELECT COUNT(*) as cnt FROM "Return"
            WHERE "tenantId" = ${tenantId} AND "createdAt" >= ${ninetyDaysAgo}
            GROUP BY "createdBy"
          ) rc
        )
        ORDER BY refundCount DESC
      `,

        prisma.$queryRaw`
        SELECT
          DATE(s."soldAt") as date,
          COUNT(*) as cashTxCount,
          COALESCE(SUM(s."totalAmount"), 0) as cashAmount
        FROM "Sale" s
        WHERE s."tenantId" = ${tenantId}
          AND s."paymentMethod" = 'CASH'
          AND s."soldAt" >= ${ninetyDaysAgo}
        GROUP BY DATE(s."soldAt")
        HAVING COALESCE(SUM(s."totalAmount"), 0) > (
          SELECT COALESCE(AVG(daily.total), 0) * 2 FROM (
            SELECT SUM(s3."totalAmount") as total
            FROM "Sale" s3
            WHERE s3."tenantId" = ${tenantId}
              AND s3."paymentMethod" = 'CASH'
              AND s3."soldAt" >= ${ninetyDaysAgo}
            GROUP BY DATE(s3."soldAt")
          ) daily
        )
        ORDER BY cashAmount DESC
      `,

        prisma.$queryRaw`
        SELECT
          u.id as "userId",
          u."fullName" as "staffName",
          COUNT(s.id) as highDiscountSales,
          COALESCE(AVG(s."discountAmount"), 0) as avgDiscount
        FROM "Sale" s
        JOIN "User" u ON u.id = s."soldBy"
        WHERE s."tenantId" = ${tenantId}
          AND s."soldAt" >= ${ninetyDaysAgo}
          AND s."discountPercentage" > 20
        GROUP BY u.id, u."fullName"
        HAVING COUNT(s.id) > 10
        ORDER BY highDiscountSales DESC
        LIMIT 10
      `,

        prisma.$queryRaw`
        SELECT
          c.id as "patientId",
          c."fullName" as "customerName",
          c.phone,
          COUNT(r.id) as returnCount,
          COALESCE(SUM(r."totalReturnAmount"), 0) as returnAmount
        FROM "Return" r
        JOIN "Patient" c ON c.id = r."patientId"
        WHERE r."tenantId" = ${tenantId}
          AND r."createdAt" >= ${ninetyDaysAgo}
        GROUP BY c.id, c."fullName", c.phone
        HAVING COUNT(r.id) > 5
        ORDER BY returnCount DESC
        LIMIT 10
      `,

        prisma.$queryRaw`
        SELECT
          m.id as "medicineId",
          m.name as "medicineName",
          m."unitPrice" as mrp,
          si."unitPrice",
          COUNT(si.id) as saleCount,
          ((m."unitPrice" - si."unitPrice") / NULLIF(m."unitPrice", 0)) * 100 as discountPct
        FROM "SaleItem" si
        JOIN "Medicine" m ON m.id = si."medicineId"
        WHERE m."tenantId" = ${tenantId}
          AND m."unitPrice" > 0
          AND si."unitPrice" < m."unitPrice" * 0.6
          AND si.id IN (
            SELECT si2.id FROM "SaleItem" si2
            JOIN "Sale" s ON s.id = si2."saleId"
            WHERE s."tenantId" = ${tenantId}
              AND s."soldAt" >= ${ninetyDaysAgo}
          )
        GROUP BY m.id, m.name, m."unitPrice", si."unitPrice"
        ORDER BY discountPct DESC
        LIMIT 10
      `,
      ]);

    const result = {
      anomalousRefunds: {
        signals: highRefundStaff.map((s) => ({
          userId: s.userId,
          staffName: s.staffName,
          refundCount: Number(s.refundCount) || 0,
          refundAmount: Number(s.refundAmount) || 0,
          avgRefundValue: Number(s.avgRefundValue) || 0,
        })),
        alert:
          highRefundStaff.length > 0
            ? `${highRefundStaff.length} staff member(s) processing statistically abnormal refunds — potential fraud`
            : null,
      },
      cashSpikeDays: {
        signals: cashSpikeDays.map((d) => ({
          date: d.date,
          cashAmount: Number(d.cashAmount) || 0,
          transactionCount: Number(d.cashTxCount) || 0,
        })),
        alert:
          cashSpikeDays.length > 0
            ? `${cashSpikeDays.length} day(s) with abnormally high cash transactions — potential reconciliation issues`
            : null,
      },
      excessiveDiscounts: {
        signals: abnormalDiscounts.map((d) => ({
          userId: d.userId,
          staffName: d.staffName,
          highDiscountCount: Number(d.highDiscountSales) || 0,
          avgDiscountAmount: Number(d.avgDiscount) || 0,
        })),
        alert:
          abnormalDiscounts.length > 0
            ? `${abnormalDiscounts.length} staff member(s) giving excessive discounts (>20%)`
            : null,
      },
      highReturnCustomers: {
        signals: highReturnCustomers.map((c) => ({
          patientId: c.patientId,
          customerName: c.customerName,
          phone: c.phone,
          returnCount: Number(c.returnCount) || 0,
          returnAmount: Number(c.returnAmount) || 0,
        })),
        alert:
          highReturnCustomers.length > 0
            ? `${highReturnCustomers.length} patient(s) with abnormally high returns`
            : null,
      },
      priceAnomalies: {
        signals: priceAnomalies.map((p) => ({
          medicineId: p.medicineId,
          medicineName: p.medicineName,
          mrp: Number(p.mrp) || 0,
          sellingPrice: Number(p.unitPrice) || 0,
          discountPercentage: Math.round(Number(p.discountPct) * 100) / 100,
          saleCount: Number(p.saleCount) || 0,
        })),
        alert:
          priceAnomalies.length > 0
            ? `${priceAnomalies.length} medicine(s) selling at >40% below MRP — verify pricing integrity`
            : null,
      },
      generatedAt: new Date(),
    };

    const totalSignals =
      (result.anomalousRefunds.signals.length > 0 ? 1 : 0) +
      (result.cashSpikeDays.signals.length > 0 ? 1 : 0) +
      (result.excessiveDiscounts.signals.length > 0 ? 1 : 0) +
      (result.highReturnCustomers.signals.length > 0 ? 1 : 0) +
      (result.priceAnomalies.signals.length > 0 ? 1 : 0);

    if (totalSignals > 0) {
      emitEvent(DOMAIN_EVENTS.FRAUD_SIGNAL_DETECTED, {
        tenantId,
        signalCount: totalSignals,
        summary: result,
      }).catch((err) => logger.warn({ err, tenantId }, 'Failed to emit fraud signal event'));
    }

    await redisClient.set(cacheKey, JSON.stringify(result), 'EX', 1800);
    return result;
  }

  async getForecastDashboard(tenantId) {
    const cacheKey = `analytics:forecast:${tenantId}`;
    const cached = await redisClient.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const [demandForecasts, recommendedOrders, seasonalTrends, expiryPredictions] =
      await Promise.all([
        prisma.demandForecast.findMany({
          where: { tenantId, branchId: null, forecastDate: { gte: new Date() } },
          orderBy: { predictedQuantity: 'desc' },
          take: 20,
          include: { medicine: { select: { name: true, genericName: true, reorderLevel: true } } },
        }),

        prisma.$queryRaw`
        SELECT
          m.id as "medicineId",
          m.name as "medicineName",
          COALESCE(SUM(ib."availableQuantity"), 0) as currentStock,
          m."reorderLevel",
          df."predictedQuantity" as predictedDemand,
          df."confidenceScore"
        FROM "DemandForecast" df
        JOIN "Medicine" m ON m.id = df."medicineId"
        LEFT JOIN "InventoryBatch" ib ON ib."medicineId" = m.id
          AND ib."deletedAt" IS NULL AND ib.status = 'ACTIVE'
        WHERE df."tenantId" = ${tenantId}
          AND df."forecastDate" >= CURRENT_DATE
          AND df."forecastDate" <= CURRENT_DATE + INTERVAL '30 days'
        GROUP BY m.id, m.name, m."reorderLevel", df."predictedQuantity", df."confidenceScore"
        HAVING COALESCE(SUM(ib."availableQuantity"), 0) < df."predictedQuantity"
        ORDER BY (df."predictedQuantity" - COALESCE(SUM(ib."availableQuantity"), 0)) DESC
        LIMIT 15
      `,

        prisma.$queryRaw`
        SELECT
          m.id as "medicineId",
          m.name as "medicineName",
          COALESCE(SUM(CASE WHEN s."soldAt" >= CURRENT_DATE - INTERVAL '30 days' THEN si.quantity ELSE 0 END), 0) as thisMonthQty,
          COALESCE(SUM(CASE WHEN s."soldAt" >= CURRENT_DATE - INTERVAL '60 days' AND s."soldAt" < CURRENT_DATE - INTERVAL '30 days' THEN si.quantity ELSE 0 END), 0) as lastMonthQty
        FROM "Medicine" m
        JOIN "SaleItem" si ON si."medicineId" = m.id
        JOIN "Sale" s ON s.id = si."saleId"
        WHERE m."tenantId" = ${tenantId}
          AND s."soldAt" >= CURRENT_DATE - INTERVAL '60 days'
        GROUP BY m.id, m.name
        HAVING SUM(CASE WHEN s."soldAt" >= CURRENT_DATE - INTERVAL '30 days' THEN si.quantity ELSE 0 END) >
               SUM(CASE WHEN s."soldAt" >= CURRENT_DATE - INTERVAL '60 days' AND s."soldAt" < CURRENT_DATE - INTERVAL '30 days' THEN si.quantity ELSE 0 END) * 1.5
        ORDER BY thisMonthQty DESC
        LIMIT 10
      `,

        prisma.expiryRiskPrediction.findMany({
          where: { tenantId, branchId: null, riskScore: { gt: 50 } },
          orderBy: { riskScore: 'desc' },
          take: 10,
          include: {
            medicine: { select: { name: true } },
            batch: { select: { batchNumber: true, expiryDate: true } },
          },
        }),
      ]);

    const result = {
      forecastHorizon: '30 days',
      modelVersion: 'v1',
      topDemandForecasts: demandForecasts.map((f) => ({
        medicineId: f.medicineId,
        medicineName: f.medicine.name,
        genericName: f.medicine.genericName,
        predictedQuantity: Number(f.predictedQuantity) || 0,
        confidenceScore: Number(f.confidenceScore) || 0,
        forecastDate: f.forecastDate,
      })),
      recommendedReorder: recommendedOrders.map((r) => ({
        medicineId: r.medicineId,
        medicineName: r.medicineName,
        currentStock: Number(r.currentStock) || 0,
        reorderLevel: r.reorderLevel,
        predictedDemand: Number(r.predictedDemand) || 0,
        suggestedOrderQty:
          Math.max(0, Number(r.predictedDemand) - Number(r.currentStock)) + (r.reorderLevel || 10),
        confidence: Number(r.confidenceScore) || 0,
      })),
      seasonalDemandSpikes: seasonalTrends.map((t) => ({
        medicineId: t.medicineId,
        medicineName: t.medicineName,
        thisMonthQuantity: Number(t.thisMonthQty) || 0,
        lastMonthQuantity: Number(t.lastMonthQty) || 0,
        growthPercentage:
          Number(t.lastMonthQty) > 0
            ? Math.round(
                ((Number(t.thisMonthQty) - Number(t.lastMonthQty)) / Number(t.lastMonthQty)) *
                  10000,
              ) / 100
            : null,
      })),
      expiryRiskItems: expiryPredictions.map((e) => ({
        medicineId: e.medicineId,
        medicineName: e.medicine.name,
        batchNumber: e.batch.batchNumber,
        expiryDate: e.batch.expiryDate,
        riskScore: Number(e.riskScore) || 0,
        predictedUnsoldQty: e.predictedUnsoldQty,
        recommendation: e.recommendation,
      })),
      generatedAt: new Date(),
    };

    await redisClient.set(cacheKey, JSON.stringify(result), 'EX', 3600);
    return result;
  }

  async getBranchPerformance(tenantId) {
    const cacheKey = `analytics:branch-performance:${tenantId}`;
    const cached = await redisClient.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const branches = await prisma.branch.findMany({
      where: { tenantId, deletedAt: null },
      select: { id: true, name: true, code: true },
    });

    const branchIds = branches.map((b) => b.id);

    if (branchIds.length === 0) {
      return {
        branches: [],
        totalRevenue: 0,
        totalProfit: 0,
        topBranch: null,
      };
    }

    const branchSales = await prisma.sale.groupBy({
      by: ['branchId'],
      where: {
        tenantId,
        branchId: { in: branchIds },
        status: 'COMPLETED',
      },
      _sum: { totalAmount: true, discountAmount: true },
      _count: { id: true },
      _avg: { totalAmount: true },
    });

    const branchSaleMap = {};
    for (const bs of branchSales) {
      if (bs.branchId) {
        branchSaleMap[bs.branchId] = {
          totalRevenue: bs._sum.totalAmount || 0,
          totalDiscount: bs._sum.discountAmount || 0,
          invoiceCount: bs._count.id || 0,
          avgInvoiceValue: bs._avg.totalAmount || 0,
        };
      }
    }

    const branchCogs = await prisma.$queryRaw`
      SELECT
        s."branchId",
        COALESCE(SUM(si.quantity * COALESCE(ib."purchasePrice", 0)), 0) as cogs
      FROM "SaleItem" si
      JOIN "Sale" s ON s.id = si."saleId"
      LEFT JOIN "InventoryBatch" ib ON ib.id = si."batchId"
      WHERE s."tenantId" = ${tenantId}
        AND s."branchId" = ANY(${branchIds}::uuid[])
        AND s.status = 'COMPLETED'
      GROUP BY s."branchId"
    `;

    const branchCogsMap = {};
    for (const bc of branchCogs) {
      branchCogsMap[bc.branchId] = Number(bc.cogs) || 0;
    }

    const branchMetrics = await prisma.branchPerformanceMetric.findMany({
      where: {
        branchId: { in: branchIds },
        metricDate: { gte: new Date(new Date().setDate(new Date().getDate() - 30)) },
      },
      orderBy: { metricDate: 'desc' },
    });

    const branchMetricMap = {};
    for (const bm of branchMetrics) {
      if (!branchMetricMap[bm.branchId]) {
        branchMetricMap[bm.branchId] = {
          avgProfitMargin: 0,
          avgStockTurnover: 0,
          totalExpiryLoss: 0,
          count: 0,
        };
      }
      branchMetricMap[bm.branchId].avgProfitMargin += Number(bm.profitMargin) || 0;
      branchMetricMap[bm.branchId].avgStockTurnover += Number(bm.stockTurnover) || 0;
      branchMetricMap[bm.branchId].totalExpiryLoss += Number(bm.expiryLoss) || 0;
      branchMetricMap[bm.branchId].count += 1;
    }

    const result = branches.map((branch) => {
      const sales = branchSaleMap[branch.id] || {
        totalRevenue: 0,
        totalDiscount: 0,
        invoiceCount: 0,
        avgInvoiceValue: 0,
      };
      const cogs = branchCogsMap[branch.id] || 0;
      const metrics = branchMetricMap[branch.id];

      return {
        branchId: branch.id,
        branchName: branch.name,
        branchCode: branch.code,
        totalRevenue: Math.round(sales.totalRevenue * 100) / 100,
        totalCogs: Math.round(cogs * 100) / 100,
        grossProfit: Math.round((sales.totalRevenue - cogs) * 100) / 100,
        profitMargin:
          sales.totalRevenue > 0
            ? Math.round(((sales.totalRevenue - cogs) / sales.totalRevenue) * 10000) / 100
            : 0,
        invoiceCount: sales.invoiceCount,
        avgInvoiceValue: Math.round(sales.avgInvoiceValue * 100) / 100,
        totalDiscount: Math.round(sales.totalDiscount * 100) / 100,
        monthlyAvgProfitMargin:
          metrics && metrics.count > 0
            ? Math.round((metrics.avgProfitMargin / metrics.count) * 100) / 100
            : null,
        monthlyAvgStockTurnover:
          metrics && metrics.count > 0
            ? Math.round((metrics.avgStockTurnover / metrics.count) * 100) / 100
            : null,
        totalExpiryLoss: metrics ? Math.round(metrics.totalExpiryLoss * 100) / 100 : 0,
      };
    });

    result.sort((a, b) => b.totalRevenue - a.totalRevenue);

    const totalRevenue = result.reduce((sum, b) => sum + b.totalRevenue, 0);
    const totalProfit = result.reduce((sum, b) => sum + b.grossProfit, 0);

    const finalResult = {
      branches: result,
      summary: {
        totalRevenue: Math.round(totalRevenue * 100) / 100,
        totalProfit: Math.round(totalProfit * 100) / 100,
        averageProfitMargin:
          totalRevenue > 0 ? Math.round((totalProfit / totalRevenue) * 10000) / 100 : 0,
        branchCount: result.length,
        bestPerformer: result.length > 0 ? result[0].branchName : null,
      },
      generatedAt: new Date(),
    };

    await redisClient.set(cacheKey, JSON.stringify(finalResult), 'EX', 1800);
    return finalResult;
  }

  async getFastMoving(tenantId) {
    const cacheKey = `bi:fast-moving:${tenantId}`;

    const cached = await redisClient.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const data = await prisma.fastMovingMedicine.findMany({
      where: { tenantId, branchId: null },
      orderBy: { ranking: 'asc' },
      take: 50,
      include: { medicine: { select: { name: true, genericName: true } } },
    });

    await redisClient.set(cacheKey, JSON.stringify(data), 'EX', 3600);
    return data;
  }

  async getSlowMovingBI(tenantId) {
    const cacheKey = `bi:slow-moving:${tenantId}`;

    const cached = await redisClient.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const data = await prisma.slowMovingStock.findMany({
      where: { tenantId, branchId: null },
      orderBy: { daysSinceLastSale: 'desc' },
      include: { medicine: { select: { name: true } } },
    });

    await redisClient.set(cacheKey, JSON.stringify(data), 'EX', 3600);
    return data;
  }

  async getDeadStock(tenantId) {
    const cacheKey = `bi:dead-stock:${tenantId}`;

    const cached = await redisClient.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const data = await prisma.deadStockAnalysis.findMany({
      where: { tenantId, branchId: null },
      orderBy: { stockValue: 'desc' },
      include: { medicine: { select: { name: true } } },
    });

    await redisClient.set(cacheKey, JSON.stringify(data), 'EX', 3600);
    return data;
  }

  async getRevenueHeatmap(tenantId) {
    const cacheKey = `bi:revenue-heatmap:${tenantId}`;

    const cached = await redisClient.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const data = await prisma.revenueHeatmap.findMany({
      where: { tenantId, branchId: null },
      orderBy: [{ weekday: 'asc' }, { hourSlot: 'asc' }],
    });

    await redisClient.set(cacheKey, JSON.stringify(data), 'EX', 3600);
    return data;
  }
}

export default new AnalyticsPrismaService();
