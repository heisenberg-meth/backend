import prisma from "../../../config/prisma.js";

class RecommendationService {
  /**
   * Recommend medicines to reorder for a patient
   * Based on their purchase history
   */
  async getReorderRecommendations(tenantId, patientId) {
    // 1. Get frequent items for this patient
    const sales = await prisma.sale.findMany({
      where: { tenantId, patientId, status: 'COMPLETED' },
      include: { items: { include: { medicine: true } } },
      orderBy: { soldAt: 'desc' },
      take: 10
    });

    const medicineFrequency = {};
    sales.forEach(sale => {
      sale.items.forEach(item => {
        if (!medicineFrequency[item.medicineId]) {
          medicineFrequency[item.medicineId] = {
            id: item.medicineId,
            name: item.medicine.name,
            count: 0,
            lastPurchase: sale.soldAt
          };
        }
        medicineFrequency[item.medicineId].count += 1;
      });
    });

    // 2. Filter items bought more than once
    return Object.values(medicineFrequency)
      .filter(m => m.count > 1)
      .sort((a, b) => b.count - a.count);
  }

  /**
   * Get global trending medicines for a tenant
   */
  async getTrendingMedicines(tenantId) {
    const medicineSales = await prisma.saleItem.groupBy({
      by: ['medicineId'],
      where: { sale: { tenantId, status: 'COMPLETED' } },
      _count: { medicineId: true },
      orderBy: { _count: { medicineId: 'desc' } },
      take: 5
    });

    return prisma.medicine.findMany({
      where: { id: { in: medicineSales.map(s => s.medicineId) } }
    });
  }
}

export default new RecommendationService();
