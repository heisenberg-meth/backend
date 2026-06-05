import prisma from '../../../config/prisma.js';
import { PURCHASE_ORDER_STATUS } from '../../../shared/constants/purchase-order-status.js';

class SupplierAnalyticsService {
  /**
   * GET /api/suppliers/:id/performance
   * Supplier scoring engine
   */
  async getSupplierPerformance(id, tenantId) {
    const supplier = await prisma.supplier.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: { metrics: true },
    });

    if (!supplier) throw new Error('Supplier not found');

    // 1. Delivery Performance from POs and GRNs
    const grns = await prisma.goodsReceiptNote.findMany({
      where: {
        tenantId,
        purchaseOrder: { supplierId: id },
      },
      include: {
        purchaseOrder: { select: { expectedDeliveryDate: true, approvedAt: true } },
        items: true,
      },
    });

    let totalLeadTime = 0;
    let onTimeCount = 0;

    grns.forEach((grn) => {
      // Lead Time: Received - Approved
      if (grn.purchaseOrder.approvedAt) {
        const leadTime = Math.max(
          0,
          Math.floor((grn.receivedDate - grn.purchaseOrder.approvedAt) / (1000 * 60 * 60 * 24)),
        );
        totalLeadTime += leadTime;
      }

      // On-Time: Received <= Expected
      if (grn.purchaseOrder.expectedDeliveryDate) {
        if (grn.receivedDate <= grn.purchaseOrder.expectedDeliveryDate) {
          onTimeCount++;
        }
      }
    });

    const averageLeadTimeDays =
      grns.length > 0 ? totalLeadTime / grns.length : supplier.leadTimeDays;
    const onTimeDeliveryRate = grns.length > 0 ? (onTimeCount / grns.length) * 100 : 100;

    // 2. Rejection Rate from returns
    const metrics = supplier.metrics || {
      qualityScore: 100,
      fulfillmentRate: 100,
      averageExpiryShelfLife: 180,
    };
    const rejectionRate = metrics.rejectionRate || (100 - metrics.qualityScore) / 10;

    // 3. Expiry Quality Score
    // Higher if delivered batches have longer shelf life
    const expiryQualityScore = metrics.qualityScore; // Using qualityScore as a proxy or metrics.expiryQuality

    // 4. Overall Score
    const overallScore =
      (onTimeDeliveryRate * 0.4 + metrics.fulfillmentRate * 0.3 + expiryQualityScore * 0.3) / 20; // Scale to 0-5

    return {
      supplierId: id,
      supplierName: supplier.name,
      onTimeDeliveryRate: parseFloat(onTimeDeliveryRate.toFixed(1)),
      averageLeadTimeDays: Math.round(averageLeadTimeDays),
      rejectionRate: parseFloat(rejectionRate.toFixed(1)),
      expiryQualityScore: Math.round(expiryQualityScore),
      overallScore: parseFloat(overallScore.toFixed(1)),
    };
  }

  /**
   * GET /api/suppliers/:id/delivery-history
   */
  async getDeliveryHistory(id, tenantId) {
    const grns = await prisma.goodsReceiptNote.findMany({
      where: {
        tenantId,
        purchaseOrder: { supplierId: id },
      },
      include: {
        purchaseOrder: {
          select: {
            orderNumber: true,
            expectedDeliveryDate: true,
            items: { select: { medicineId: true, quantity: true } },
          },
        },
        items: true,
      },
      orderBy: { receivedDate: 'desc' },
      take: 50,
    });

    return {
      deliveries: grns.map((grn) => {
        const delay = grn.purchaseOrder.expectedDeliveryDate
          ? Math.max(
              0,
              Math.floor(
                (grn.receivedDate - grn.purchaseOrder.expectedDeliveryDate) / (1000 * 60 * 60 * 24),
              ),
            )
          : 0;

        // Check for shortages
        let shortageDetected = false;
        grn.purchaseOrder.items.forEach((poItem) => {
          const receivedItem = grn.items.find((gi) => gi.medicineId === poItem.medicineId);
          if (!receivedItem || receivedItem.receivedQuantity < poItem.quantity) {
            shortageDetected = true;
          }
        });

        return {
          purchaseOrder: grn.purchaseOrder.orderNumber,
          deliveredAt: grn.receivedDate,
          deliveryDelayDays: delay,
          shortageDetected,
        };
      }),
    };
  }

  /**
   * GET /api/suppliers/:id/spend-analysis
   */
  async getSpendAnalysis(id, tenantId) {
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const [categorySpend, monthlySpend] = await Promise.all([
      // Spend by Medicine
      prisma.purchaseOrderItem.groupBy({
        by: ['medicineId', 'medicineName'],
        where: {
          purchaseOrder: { supplierId: id, tenantId, status: PURCHASE_ORDER_STATUS.RECEIVED },
        },
        _sum: { totalAmount: true },
      }),
      // Spend by Month
      prisma.purchaseOrder.findMany({
        where: {
          supplierId: id,
          tenantId,
          status: PURCHASE_ORDER_STATUS.RECEIVED,
          createdAt: { gte: sixMonthsAgo },
        },
        select: { createdAt: true, totalAmount: true },
      }),
    ]);

    return {
      supplierId: id,
      totalSpent: monthlySpend.reduce((sum, po) => sum + po.totalAmount, 0),
      monthlyTrends: this._groupTrendsByMonth(monthlySpend),
      categoryBreakdown: categorySpend.map((c) => ({
        medicineId: c.medicineId,
        medicineName: c.medicineName,
        totalAmount: c._sum.totalAmount,
      })),
    };
  }

  /**
   * GET /api/suppliers/:id/reconciliation
   */
  async getReconciliation(id, tenantId) {
    const invoices = await prisma.purchaseInvoice.findMany({
      where: { supplierId: id, tenantId },
      include: { allocations: { include: { payment: true } } },
      orderBy: { invoiceDate: 'desc' },
      take: 50,
    });

    return {
      supplierId: id,
      reconciliation: invoices.map((inv) => ({
        invoiceId: inv.id,
        invoiceNumber: inv.invoiceNumber,
        totalAmount: inv.totalAmount,
        paidAmount: inv.paidAmount,
        balance: inv.balanceAmount,
        status: inv.paymentStatus,
        allocations: inv.allocations.map((a) => ({
          paymentId: a.paymentId,
          amount: a.amount,
          date: a.createdAt,
          method: a.payment.paymentMethod,
        })),
      })),
    };
  }

  /**
   * GET /api/suppliers/:id/risk-alerts
   */
  async getRiskAlerts(id, tenantId) {
    const performance = await this.getSupplierPerformance(id, tenantId);
    const alerts = [];

    if (performance.onTimeDeliveryRate < 70) {
      alerts.push({
        type: 'DELIVERY_RELIABILITY',
        severity: 'CRITICAL',
        message: `Supplier delivery reliability is low (${performance.onTimeDeliveryRate}%).`,
      });
    }

    if (performance.rejectionRate > 5) {
      alerts.push({
        type: 'QUALITY_RISK',
        severity: 'WARNING',
        message: `High rejection rate detected (${performance.rejectionRate}%).`,
      });
    }

    const pending = await this.getPendingPayments(id, tenantId);
    if (pending.overdueAmount > 500000) {
      alerts.push({
        type: 'FINANCIAL_LIABILITY',
        severity: 'CRITICAL',
        message: `High overdue liability (₹${pending.overdueAmount.toLocaleString()}).`,
      });
    }

    return {
      supplierId: id,
      riskLevel:
        performance.overallScore < 2.5 ? 'HIGH' : performance.overallScore < 4 ? 'MEDIUM' : 'LOW',
      alerts,
    };
  }

  /**
   * GET /api/suppliers/:id/purchase-history
   */
  async getPurchaseHistory(id, tenantId, { page = 1, limit = 50 }) {
    const skip = (page - 1) * limit;
    const where = { supplierId: id, tenantId, deletedAt: null };

    const [orders, total, aggregation] = await Promise.all([
      prisma.purchaseOrder.findMany({
        where,
        include: {
          items: { select: { medicineName: true, quantity: true, totalAmount: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.purchaseOrder.count({ where }),
      prisma.purchaseOrder.aggregate({
        where: { ...where, status: PURCHASE_ORDER_STATUS.RECEIVED },
        _count: { id: true },
        _sum: { totalAmount: true },
      }),
    ]);

    // Top Medicines
    const topMedicines = await prisma.purchaseOrderItem.groupBy({
      by: ['medicineId', 'medicineName'],
      where: {
        purchaseOrder: { supplierId: id, tenantId, status: PURCHASE_ORDER_STATUS.RECEIVED },
      },
      _sum: { quantity: true, totalAmount: true },
      orderBy: { _sum: { totalAmount: 'desc' } },
      take: 5,
    });

    // Monthly Trends (Last 6 months)
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const trends = await prisma.purchaseOrder.findMany({
      where: {
        supplierId: id,
        tenantId,
        status: PURCHASE_ORDER_STATUS.RECEIVED,
        createdAt: { gte: sixMonthsAgo },
      },
      select: { createdAt: true, totalAmount: true },
    });

    const monthlyTrends = this._groupTrendsByMonth(trends);

    return {
      supplierId: id,
      summary: {
        totalOrders: aggregation._count.id,
        totalSpent: aggregation._sum.totalAmount || 0,
      },
      recentPurchases: orders,
      topMedicines: topMedicines.map((m) => ({
        medicineId: m.medicineId,
        name: m.medicineName,
        quantity: m._sum.quantity,
        spent: m._sum.totalAmount,
      })),
      monthlyTrends,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * GET /api/suppliers/:id/pending-payments
   */
  async getPendingPayments(id, tenantId) {
    const invoices = await prisma.purchaseInvoice.findMany({
      where: { supplierId: id, tenantId, paymentStatus: { not: 'PAID' } },
      orderBy: { dueDate: 'asc' },
    });

    const now = new Date();
    let totalPending = 0;
    let totalOverdue = 0;

    const agedInvoices = invoices.map((inv) => {
      totalPending += inv.totalAmount;
      const overdueDays =
        inv.dueDate && inv.dueDate < now
          ? Math.floor((now - inv.dueDate) / (1000 * 60 * 60 * 24))
          : 0;

      if (overdueDays > 0) totalOverdue += inv.totalAmount;

      return {
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        amount: inv.totalAmount,
        dueDate: inv.dueDate,
        overdueDays,
        status: inv.paymentStatus,
      };
    });

    // Aging Buckets
    const buckets = {
      '0-30 days': 0,
      '31-60 days': 0,
      '61+ days': 0,
    };

    agedInvoices.forEach((inv) => {
      if (inv.overdueDays === 0) return;
      if (inv.overdueDays <= 30) buckets['0-30 days'] += inv.amount;
      else if (inv.overdueDays <= 60) buckets['31-60 days'] += inv.amount;
      else buckets['61+ days'] += inv.amount;
    });

    return {
      supplierId: id,
      pendingAmount: totalPending,
      overdueAmount: totalOverdue,
      agingBuckets: buckets,
      invoices: agedInvoices,
    };
  }

  /**
   * GET /api/suppliers/:id/drugs
   */
  async getSupplierDrugs(id, tenantId) {
    const medicines = await prisma.medicineSupplier.findMany({
      where: { supplierId: id, medicine: { tenantId, deletedAt: null } },
      include: {
        medicine: {
          select: { id: true, name: true, unitPrice: true },
        },
      },
    });

    const result = await Promise.all(
      medicines.map(async (ms) => {
        // Get last purchase price and history
        const lastItems = await prisma.purchaseOrderItem.findMany({
          where: {
            medicineId: ms.medicineId,
            purchaseOrder: { supplierId: id, tenantId, status: PURCHASE_ORDER_STATUS.RECEIVED },
          },
          orderBy: { purchaseOrder: { createdAt: 'desc' } },
          take: 5,
          select: { unitPrice: true, purchaseOrder: { select: { createdAt: true } } },
        });

        return {
          medicineId: ms.medicineId,
          name: ms.medicine.name,
          currentMasterPrice: ms.medicine.unitPrice,
          averagePurchasePrice:
            lastItems.length > 0
              ? lastItems.reduce((sum, i) => sum + i.unitPrice, 0) / lastItems.length
              : 0,
          lastPurchasedAt: lastItems[0]?.purchaseOrder.createdAt || null,
          priceHistory: lastItems.map((i) => ({
            price: i.unitPrice,
            date: i.purchaseOrder.createdAt,
          })),
          availabilityStatus: 'ACTIVE', // Logic can be improved based on recent lead times
        };
      }),
    );

    return {
      supplierId: id,
      medicines: result,
    };
  }

  /**
   * Internal Helper: Risk Score Calculation
   */
  _calculateRiskScore(metrics, pendingPayments, onTimeRate) {
    let score = 0;

    // Low delivery reliability
    if (onTimeRate < 80) score += 5;
    if (onTimeRate < 60) score += 10;

    // High Quality Issues
    if (metrics.qualityScore < 90) score += 5;
    if (metrics.qualityScore < 70) score += 15;

    // Financial Burden
    if (pendingPayments > 1000000) score += 5;

    // Expiry issues
    if (metrics.expiryIssuePercentage > 5) score += 10;

    return score; // 0 is perfect, higher is riskier
  }

  /**
   * Internal Helper: Group Trends by Month
   */
  _groupTrendsByMonth(trends) {
    const months = {};
    trends.forEach((t) => {
      const month = t.createdAt.toISOString().substring(0, 7); // YYYY-MM
      months[month] = (months[month] || 0) + t.totalAmount;
    });

    return Object.entries(months)
      .map(([month, total]) => ({ month, total }))
      .sort((a, b) => a.month.localeCompare(b.month));
  }

  /**
   * Internal Helper: Fulfillment Rate
   */
  async _calculateFulfillmentRate(supplierId, tenantId) {
    // In a real system, we'd sum (received_qty / ordered_qty) across all items
    // Since we don't have partial fulfillment tracking yet in schema, we assume 100% for RECEIVED status
    // and 0% for others for this prototype calculation.
    const stats = await prisma.purchaseOrder.groupBy({
      by: ['status'],
      where: { supplierId, tenantId },
      _count: { id: true },
    });

    const receivedCount = stats.find((s) => s.status === 'RECEIVED')?._count.id || 0;
    const totalCount = stats.reduce((sum, s) => sum + s._count.id, 0);

    return totalCount > 0 ? (receivedCount / totalCount) * 100 : 100;
  }

  /**
   * GET /api/suppliers/compare?ids=uuid1,uuid2
   */
  async compareSuppliers(ids, tenantId) {
    const supplierIds = ids.split(',');
    const comparisons = await Promise.all(
      supplierIds.map((id) => this.getSupplierPerformance(id, tenantId)),
    );
    return comparisons;
  }

  /**
   * GET /api/suppliers/rankings
   */
  async getSupplierRankings(tenantId) {
    const suppliers = await prisma.supplier.findMany({
      where: { tenantId, deletedAt: null },
      include: { metrics: true },
    });

    const ranked = suppliers.map((s) => {
      const onTimeRate =
        s.metrics?.totalOrders > 0
          ? (s.metrics.onTimeDeliveries / s.metrics.totalOrders) * 100
          : 100;

      // Basic Ranking Score (Lower is better for risk, but here we want Higher is better for performance)
      // Score = (OnTimeRate * 0.4) + (QualityScore * 0.4) + (FulfillmentRate * 0.2)
      // Since we don't have fulfillment rate pre-calculated easily for all, we use quality and reliability.
      const perfScore = onTimeRate * 0.5 + (s.metrics?.qualityScore || 100) * 0.5;

      return {
        id: s.id,
        name: s.name,
        performanceScore: parseFloat(perfScore.toFixed(1)),
        onTimeRate: parseFloat(onTimeRate.toFixed(1)),
        qualityScore: s.metrics?.qualityScore || 100,
        riskLevel: perfScore > 80 ? 'LOW' : perfScore > 60 ? 'MEDIUM' : 'HIGH',
      };
    });

    return ranked.sort((a, b) => b.performanceScore - a.performanceScore);
  }
}

export default new SupplierAnalyticsService();
