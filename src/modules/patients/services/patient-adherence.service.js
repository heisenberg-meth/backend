import prisma from '../../../config/prisma.js';

class PatientAdherenceService {
  async logAdherence(patientId, tenantId, data) {
    const patient = await prisma.patient.findFirst({
      where: { id: patientId, tenantId, deletedAt: null },
    });
    if (!patient) throw new Error('Patient not found');

    const record = await prisma.patientAdherence.create({
      data: {
        tenantId,
        patientId,
        medicineId: data.medicineId || null,
        medicineName: data.medicineName || null,
        scheduledTime: data.scheduledTime ? new Date(data.scheduledTime) : null,
        takenTime: data.takenTime ? new Date(data.takenTime) : new Date(),
        taken: data.taken ?? true,
        dosage: data.dosage || null,
        notes: data.notes || null,
      },
    });

    return record;
  }

  async getAdherenceHistory(patientId, tenantId, { days = 30, page = 1, limit = 50 } = {}) {
    const patient = await prisma.patient.findFirst({
      where: { id: patientId, tenantId, deletedAt: null },
    });
    if (!patient) throw new Error('Patient not found');

    const since = new Date();
    since.setDate(since.getDate() - days);

    const skip = (page - 1) * limit;
    const [records, total] = await Promise.all([
      prisma.patientAdherence.findMany({
        where: { patientId, tenantId, createdAt: { gte: since } },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.patientAdherence.count({ where: { patientId, tenantId, createdAt: { gte: since } } }),
    ]);

    const totalDoses = records.length;
    const takenDoses = records.filter(r => r.taken).length;
    const adherenceRate = totalDoses > 0 ? Math.round((takenDoses / totalDoses) * 100) : null;

    return {
      records,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      summary: { totalDoses, takenDoses, missedDoses: totalDoses - takenDoses, adherenceRate },
    };
  }

  async getAdherenceRate(patientId, tenantId) {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const records = await prisma.patientAdherence.findMany({
      where: {
        patientId,
        tenantId,
        createdAt: { gte: thirtyDaysAgo },
      },
    });

    const total = records.length;
    if (total === 0) return { rate: null, total: 0, taken: 0, missed: 0 };

    const taken = records.filter(r => r.taken).length;
    return {
      rate: Math.round((taken / total) * 100),
      total,
      taken,
      missed: total - taken,
    };
  }
}

export default new PatientAdherenceService();
