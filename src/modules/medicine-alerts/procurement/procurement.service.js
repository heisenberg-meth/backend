import prisma from '../../../config/prisma.js';
import forecastingService from '../forecasting/forecasting.service.js';
import alertRepository from '../repositories/alert.repository.js';
import { emitEvent } from '../../../shared/events/erp-event-bus.js';
import { DOMAIN_EVENTS } from '../../../shared/constants/events.js';

class ProcurementIntegrationService {
  async generateReorderPOs(tenantId, branchId = null) {
    const lowStockAlerts = await alertRepository.findLowStockAlerts({
      tenantId,
      branchId,
      page: 1,
      limit: 200,
    });

    const poSuggestions = [];

    for (const alert of lowStockAlerts.alerts) {
      const reorderRec = await forecastingService.getReorderRecommendations(
        alert.medicineId,
        tenantId,
        alert.branchId
      );

      if (!reorderRec || reorderRec.recommendedOrderQuantity <= 0) continue;

      const supplier = await this._getPreferredSupplier(alert.medicineId, tenantId);

      poSuggestions.push({
        medicineId: alert.medicineId,
        medicineName: alert.medicine?.name,
        currentStock: alert.currentStock,
        recommendedQuantity: reorderRec.recommendedOrderQuantity,
        leadTimeDays: reorderRec.leadTime,
        supplier: supplier
          ? {
              supplierId: supplier.supplierId,
              supplierName: supplier.supplier?.name,
              contactEmail: supplier.supplier?.email,
            }
          : null,
        estimatedCost: supplier?.averagePurchasePrice
          ? reorderRec.recommendedOrderQuantity * supplier.averagePurchasePrice
          : null,
        priority: alert.severity,
        branchId: alert.branchId,
      });
    }

    poSuggestions.sort((a, b) => {
      const priorityOrder = { CRITICAL: 0, WARNING: 1, INFO: 2 };
      return (priorityOrder[a.priority] ?? 3) - (priorityOrder[b.priority] ?? 3);
    });

    return poSuggestions;
  }

  async createAutoPO(tenantId, medicineId, branchId = null) {
    const reorderRec = await forecastingService.getReorderRecommendations(medicineId, tenantId, branchId);
    if (!reorderRec) throw new Error('No reorder recommendation available');

    const supplier = await this._getPreferredSupplier(medicineId, tenantId);
    if (!supplier) throw new Error('No preferred supplier found for this medicine');

    const medicine = await prisma.medicine.findUnique({
      where: { id: medicineId },
      select: { name: true, gstPercentage: true },
    });

    const subtotal = reorderRec.recommendedOrderQuantity * (supplier.averagePurchasePrice || 0);
    const gstAmount = subtotal * ((medicine?.gstPercentage || 12) / 100);
    const totalAmount = subtotal + gstAmount;

    const expectedDeliveryDate = new Date();
    expectedDeliveryDate.setDate(expectedDeliveryDate.getDate() + reorderRec.leadTime);

    const po = await prisma.purchaseOrder.create({
      data: {
        tenantId,
        orderNumber: this._generatePONumber(tenantId),
        supplierId: supplier.supplierId,
        status: 'DRAFT',
        subtotal,
        gstAmount,
        totalAmount,
        expectedDeliveryDate,
        notes: `Auto-generated PO for ${medicine?.name}. ${reorderRec.recommendedOrderQuantity} units recommended based on ${reorderRec.averageDailyUsage} avg daily usage.`,
        items: {
          create: {
            medicineId,
            quantity: reorderRec.recommendedOrderQuantity,
            unitPrice: supplier.averagePurchasePrice || 0,
            gstPercentage: medicine?.gstPercentage || 12,
          },
        },
      },
      include: {
        supplier: { select: { name: true, email: true } },
        items: { include: { medicine: { select: { name: true } } } },
      },
    });

    await emitEvent(DOMAIN_EVENTS.PURCHASE_ORDER_CREATED, {
      tenantId,
      poId: po.id,
      orderNumber: po.orderNumber,
      supplierId: supplier.supplierId,
      totalAmount,
      timestamp: new Date().toISOString(),
    });

    return po;
  }

  async getSupplierPerformance(tenantId) {
    const suppliers = await prisma.medicineSupplier.findMany({
      where: { medicine: { tenantId } },
      include: {
        supplier: {
          select: {
            id: true,
            name: true,
            rating: true,
            leadTimeDays: true,
            reliabilityScore: true,
          },
        },
        medicine: {
          select: { name: true },
        },
      },
    });

    const performanceMap = {};

    for (const ms of suppliers) {
      const sid = ms.supplierId;
      if (!performanceMap[sid]) {
        performanceMap[sid] = {
          supplierId: sid,
          supplierName: ms.supplier.name,
          rating: ms.supplier.rating,
          reliabilityScore: ms.supplier.reliabilityScore,
          leadTimeDays: ms.supplier.leadTimeDays,
          medicinesSupplied: 0,
          avgLeadDays: 0,
          totalLeadDays: 0,
        };
      }

      performanceMap[sid].medicinesSupplied++;
      performanceMap[sid].totalLeadDays += ms.leadDays || ms.supplier.leadTimeDays || 0;
    }

    return Object.values(performanceMap).map((p) => ({
      ...p,
      avgLeadDays: p.medicinesSupplied > 0 ? Math.round(p.totalLeadDays / p.medicinesSupplied) : 0,
    }));
  }

  async _getPreferredSupplier(medicineId, tenantId) {
    return prisma.medicineSupplier.findFirst({
      where: {
        medicineId,
        medicine: { tenantId },
        isPreferred: true,
      },
      include: {
        supplier: { select: { id: true, name: true, email: true } },
      },
    });
  }

  _generatePONumber(tenantId) {
    const date = new Date();
    const year = date.getFullYear().toString().slice(-2);
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `PO-${tenantId.slice(0, 4).toUpperCase()}-${year}${month}${day}-${random}`;
  }
}

export default new ProcurementIntegrationService();
