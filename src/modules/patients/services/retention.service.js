import prisma from "../../../config/prisma.js";
import { subDays } from "date-fns";

class RetentionService {
  /**
   * Identify VIP Patients
   * Logic: Top 10% by totalSpent or those with > 5 purchases
   */
  async getVipCustomers(tenantId) {
    return prisma.patient.findMany({
      where: {
        tenantId,
        deletedAt: null,
        OR: [
          { totalSpent: { gt: 5000 } }, // Absolute threshold example
          { sales: { _count: { gt: 5 } } },
        ],
      },
      orderBy: { totalSpent: 'desc' },
      take: 20,
    });
  }

  /**
   * Identify Inactive Patients
   * Logic: Last purchase > 60 days ago
   */
  async getInactiveCustomers(tenantId) {
    const sixtyDaysAgo = subDays(new Date(), 60);
    return prisma.patient.findMany({
      where: {
        tenantId,
        deletedAt: null,
        lastPurchaseDate: { lt: sixtyDaysAgo }
      },
      orderBy: { lastPurchaseDate: 'desc' }
    });
  }

  /**
   * Identify Chronic Patients
   * Logic: Patients with > 2 prescriptions
   */
  async getChronicPatients(tenantId) {
    return prisma.patient.findMany({
      where: {
        tenantId,
        deletedAt: null,
        prescriptions: { _count: { gt: 2 } }
      },
      include: {
        _count: { select: { prescriptions: true } }
      }
    });
  }
}

export default new RetentionService();
