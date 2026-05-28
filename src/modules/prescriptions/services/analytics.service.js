import prescriptionRepository from '../repositories/prescription.repository.js';

class PrescriptionAnalyticsService {
  async getPrescriptionAnalytics(tenantId, options = {}) {
    const analytics = await prescriptionRepository.getPrescriptionAnalytics(tenantId, options);

    const statusBreakdown = analytics.byStatus.map((s) => ({
      status: s.status,
      count: s._count,
    }));

    const verificationBreakdown = analytics.byVerification.map((v) => ({
      status: v.verificationStatus,
      count: v._count,
    }));

    return {
      totalPrescriptions: analytics.total,
      statusBreakdown,
      verificationBreakdown,
      recentPrescriptions: analytics.recent.map((p) => ({
        id: p.id,
        prescriptionNumber: p.prescriptionNumber,
        patientName: p.patient?.fullName,
        doctorName: p.doctor?.doctorName,
        status: p.status,
        createdAt: p.createdAt,
      })),
    };
  }

  async getPrescriptionStats(tenantId) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const thisMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    const [todayCount, monthCount, pendingVerification, activePrescriptions] = await Promise.all([
      prescriptionRepository.findPrescriptions(tenantId, {
        from: today.toISOString(),
        limit: 1000,
      }),
      prescriptionRepository.findPrescriptions(tenantId, {
        from: thisMonth.toISOString(),
        limit: 1000,
      }),
      prescriptionRepository.findPrescriptions(tenantId, {
        verificationStatus: 'PENDING',
        limit: 1000,
      }),
      prescriptionRepository.findPrescriptions(tenantId, {
        status: 'ACTIVE',
        limit: 1000,
      }),
    ]);

    return {
      createdToday: todayCount.total,
      createdThisMonth: monthCount.total,
      pendingVerification: pendingVerification.total,
      activePrescriptions: activePrescriptions.total,
    };
  }
}

export default new PrescriptionAnalyticsService();
