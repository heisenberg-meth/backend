import prisma from '../../../config/prisma.js';

class ReorderService {
  async predictReorder(medicineId, tenantId) {
    const medicine = await prisma.medicine.findUnique({
      where: { id: medicineId },
      include: {
        inventory: true,
        inventoryConfig: true,
      },
    });

    if (!medicine) throw new Error('Medicine not found');

    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const sales = await prisma.invoiceItem.aggregate({
      where: {
        medicineId,
        invoice: {
          tenantId,
          createdAt: { gte: ninetyDaysAgo },
          status: 'COMPLETED',
        },
      },
      _sum: { quantity: true },
    });

    const totalSold = sales._sum.quantity || 0;
    const avgDailyDemand = totalSold / 90;

    const recentGrns = await prisma.goodsReceiptNote.findMany({
      where: {
        tenantId,
        purchaseOrder: {
          items: { some: { medicineId } },
        },
      },
      include: { purchaseOrder: true },
      take: 5,
      orderBy: { createdAt: 'desc' },
    });

    let avgLeadTime = 7;
    if (recentGrns.length > 0) {
      const times = recentGrns.map((grn) => {
        const orderDate = new Date(grn.purchaseOrder.createdAt);
        const receiptDate = new Date(grn.createdAt);
        return (receiptDate - orderDate) / (1000 * 60 * 60 * 24);
      });
      avgLeadTime = times.reduce((a, b) => a + b, 0) / times.length;
    }

    const safetyStock = medicine.inventoryConfig?.[0]?.safetyStock || 20;
    const recommendedQuantity = Math.ceil(avgDailyDemand * avgLeadTime + safetyStock);

    const confidence = Math.min(1.0, (recentGrns.length / 5) * 0.5 + (totalSold > 100 ? 0.5 : 0.2));

    return {
      medicineId,
      medicineName: medicine.name,
      recommendedQuantity,
      avgDailyDemand: parseFloat(avgDailyDemand.toFixed(2)),
      avgLeadTime: parseFloat(avgLeadTime.toFixed(1)),
      safetyStock,
      confidence: parseFloat(confidence.toFixed(2)),
      predictedStockoutDays:
        avgDailyDemand > 0
          ? Math.floor((medicine.inventory[0]?.quantity || 0) / avgDailyDemand)
          : 999,
    };
  }
}

export default new ReorderService();
