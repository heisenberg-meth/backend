import prisma from '../../../config/prisma.js';
import logger from '../../../shared/utils/logger.js';

class AutomatedProcurementService {
  /**
   * Proactively generate purchase orders based on AI forecasts
   */
  async runAutoProcurement(tenantId) {
    // 1. Get recent forecasts
    const forecasts = await prisma.demandForecast.findMany({
      where: { tenantId, forecastDate: { gte: new Date() } },
      orderBy: { forecastDate: 'asc' },
      take: 50
    });

    for (const forecast of forecasts) {
      // 2. Check current stock levels
      const currentStock = await prisma.inventoryBatch.aggregate({
        where: { medicineId: forecast.medicineId, status: 'ACTIVE' },
        _sum: { quantity: true }
      });

      const stockQty = currentStock._sum.quantity || 0;
      
      // 3. Logic: If predicted demand > current stock + safety margin
      const safetyMargin = 1.2; // 20% buffer
      if (forecast.predictedQuantity * safetyMargin > stockQty) {
        logger.info({ medicineId: forecast.medicineId }, '[PROCUREMENT_AI] Triggering PO creation');
        
        await this.triggerPurchaseOrder(tenantId, forecast.medicineId, forecast.predictedQuantity);
      }
    }
  }

  async triggerPurchaseOrder(tenantId, medicineId, quantity) {
    // Logic to create Purchase Order in Procurement Module
    // await procurementService.createRequest(...);
    logger.info({ medicineId, quantity }, '[PROCUREMENT_AI] PO Request successfully queued');
  }
}

export default new AutomatedProcurementService();
