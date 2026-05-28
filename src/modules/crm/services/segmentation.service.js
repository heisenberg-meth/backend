import prisma from '../../../config/prisma.js';
import logger from '../../../shared/utils/logger.js';

class SegmentationService {
  async updateSegments(tenantId) {
    logger.info(`[SegmentationService] Updating segments for tenant ${tenantId}`);

    const patients = await prisma.patient.findMany({
      where: { tenantId, deletedAt: null },
      include: {
        patientBehaviors: true,
        sales: {
          where: { status: 'COMPLETED' },
          orderBy: { soldAt: 'desc' },
          take: 1,
          select: { soldAt: true },
        },
      },
    });

    for (const patient of patients) {
      const segments = new Set();
      const now = new Date();

      const totalPatientSpend = patient.patientBehaviors.reduce((sum, b) => sum + b.totalSpent, 0);
      if (totalPatientSpend > 5000) {
        segments.add('VIP');
      }

      const chronicBehaviors = patient.patientBehaviors.filter(b => b.purchaseFrequency >= 3 && b.adherenceScore > 70);
      if (chronicBehaviors.length > 0) {
        segments.add('CHRONIC');
      }

      const lastSaleDate = patient.sales.length > 0 ? patient.sales[0].soldAt : null;
      if (lastSaleDate) {
         const daysSinceLastSale = Math.floor((now - lastSaleDate) / (1000 * 60 * 60 * 24));
         if (daysSinceLastSale > 90) {
            segments.add('INACTIVE');
         }
      } else {
         segments.add('INACTIVE');
      }

      await prisma.patientSegment.deleteMany({
        where: { patientId: patient.id }
      });

      if (segments.size > 0) {
        const data = Array.from(segments).map(seg => ({
          patientId: patient.id,
          segmentName: seg
        }));
        await prisma.patientSegment.createMany({ data });
      }
    }

    logger.info(`[SegmentationService] Segments updated for tenant ${tenantId}`);
  }
}

export default new SegmentationService();