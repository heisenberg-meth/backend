import analyticsRepository from '../repository/analytics.repository.js';

class AnalyticsService {
  async getTenantKPIs(tenantId) {
    const [totalSku, lowStock, expiring30Days, inventoryValue, supplierCount] =
      await Promise.all([
        analyticsRepository.getSkuCount(tenantId),
        analyticsRepository.getLowStockCount(tenantId),
        analyticsRepository.getExpiring30Count(tenantId),
        analyticsRepository.getInventoryValue(tenantId),
        analyticsRepository.getSupplierCount(tenantId),
      ]);

    return {
      totalSku: Number(totalSku || 0),
      lowStock: Number(lowStock || 0),
      expiring30Days: Number(expiring30Days || 0),
      inventoryValue: Number(inventoryValue || 0),
      supplierCount: Number(supplierCount || 0),
    };
  }
}

export default new AnalyticsService();
