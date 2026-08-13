import prisma from '../../../config/prisma.js';
import alertRepository from '../repositories/alert.repository.js';
import forecastingService from '../forecasting/forecasting.service.js';
import { emitEvent, DOMAIN_EVENTS } from '../../../shared/events/erp-event-bus.js';

class ProcurementIntegrationService {
  /**
   * Generate PO suggestions for low-stock medicines
   */
  async generateReorderPOs(tenantId) {
    const { alerts } = await alertRepository.findLowStockAlerts(tenantId, { limit: 200 });
    if (!alerts || alerts.length === 0) return [];

    const suggestions = [];
    const priorityWeights = {
      CRITICAL: 1,
      WARNING: 2,
      INFO: 3,
    };

    for (const alert of alerts) {
      const recommendation = await forecastingService.getReorderRecommendations(
        alert.medicineId,
        tenantId,
        alert.branchId,
      );

      if (!recommendation) continue;

      const supplierRelation =
        (await prisma.medicineSupplier.findFirst({
          where: {
            medicineId: alert.medicineId,
            tenantId,
            isPreferred: true,
          },
          include: {
            supplier: true,
          },
        })) ||
        (await prisma.medicineSupplier.findFirst({
          where: {
            medicineId: alert.medicineId,
          },
          include: {
            supplier: true,
          },
        }));

      suggestions.push({
        medicineId: alert.medicineId,
        medicineName: alert.medicine?.name,
        branchId: alert.branchId,
        currentStock: alert.currentStock,
        recommendedQuantity: recommendation.recommendedOrderQuantity,
        priority: alert.severity,
        supplier: supplierRelation
          ? {
              id: supplierRelation.supplierId,
              name: supplierRelation.supplier?.name,
              email: supplierRelation.supplier?.email,
              averagePurchasePrice: supplierRelation.averagePurchasePrice,
            }
          : undefined,
        leadTime: recommendation.leadTime,
        estimatedCost: supplierRelation?.averagePurchasePrice
          ? supplierRelation.averagePurchasePrice * recommendation.recommendedOrderQuantity
          : 0,
      });
    }

    suggestions.sort((a, b) => {
      const weightA = priorityWeights[a.priority] || 99;
      const weightB = priorityWeights[b.priority] || 99;
      return weightA - weightB;
    });

    return suggestions;
  }

  /**
   * Create an automated Purchase Order for a medicine
   */
  async createAutoPO(tenantId, medicineId, branchId) {
    const recommendation = await forecastingService.getReorderRecommendations(
      medicineId,
      tenantId,
      branchId,
    );

    if (!recommendation) {
      throw new Error('No reorder recommendation available');
    }

    const supplierRelation = await prisma.medicineSupplier.findFirst({
      where: {
        medicineId,
        tenantId,
      },
      include: {
        supplier: true,
      },
    });

    if (!supplierRelation) {
      throw new Error('No preferred supplier found');
    }

    const medicine = await prisma.medicine.findUnique({
      where: { id: medicineId },
    });

    const quantity = recommendation.recommendedOrderQuantity;
    const unitPrice = supplierRelation.averagePurchasePrice || 0;
    const subtotal = unitPrice * quantity;
    const gstRate = (medicine?.gstPercentage || 0) / 100;
    const gstAmount = subtotal * gstRate;
    const totalAmount = subtotal + gstAmount;

    const po = await prisma.purchaseOrder.create({
      data: {
        tenantId,
        branchId,
        supplierId: supplierRelation.supplierId,
        orderNumber: `PO-${Date.now()}`,
        status: 'DRAFT',
        subtotal,
        gstAmount,
        totalAmount,
        items: {
          create: [
            {
              medicineId,
              quantity,
              unitPrice,
              totalAmount,
            },
          ],
        },
      },
      include: {
        supplier: true,
        items: {
          include: {
            medicine: true,
          },
        },
      },
    });

    if (emitEvent && DOMAIN_EVENTS?.PURCHASE_ORDER_CREATED) {
      await emitEvent(DOMAIN_EVENTS.PURCHASE_ORDER_CREATED, {
        tenantId,
        purchaseOrderId: po.id,
        orderNumber: po.orderNumber,
        supplierId: po.supplierId,
        totalAmount: po.totalAmount,
      });
    }

    return po;
  }

  /**
   * Aggregate supplier performance metrics
   */
  async getSupplierPerformance(tenantId) {
    const relations = await prisma.medicineSupplier.findMany({
      where: { tenantId },
      include: {
        supplier: true,
        medicine: true,
      },
    });

    const supplierMap = new Map();

    for (const rel of relations) {
      const sId = rel.supplierId;
      if (!supplierMap.has(sId)) {
        supplierMap.set(sId, {
          supplierId: sId,
          supplierName: rel.supplier?.name,
          rating: rel.supplier?.rating,
          leadTimeDays: rel.supplier?.leadTimeDays,
          reliabilityScore: rel.supplier?.reliabilityScore,
          medicinesSupplied: 0,
          totalLeadDays: 0,
        });
      }
      const data = supplierMap.get(sId);
      data.medicinesSupplied += 1;
      data.totalLeadDays += rel.leadDays || 0;
    }

    const results = [];
    for (const [data] of supplierMap) {
      results.push({
        supplierId: data.supplierId,
        supplierName: data.supplierName,
        rating: data.rating,
        leadTimeDays: data.leadTimeDays,
        reliabilityScore: data.reliabilityScore,
        medicinesSupplied: data.medicinesSupplied,
        avgLeadDays: Math.round(data.totalLeadDays / data.medicinesSupplied),
      });
    }

    return results;
  }
}

export default new ProcurementIntegrationService();
