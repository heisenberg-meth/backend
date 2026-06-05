import prisma from '../../../config/prisma.js';

class RefillRepository {
  async findRefillRecords(patientId, tenantId) {
    return prisma.patientRefill.findMany({
      where: { patientId, tenantId },
      include: {
        medicine: { select: { id: true, name: true, genericName: true } },
      },
      orderBy: { expectedRefillAt: 'asc' },
    });
  }

  async upsertRefillPrediction(tenantId, patientId, medicineId, data) {
    return prisma.patientRefill.upsert({
      where: {
        tenantId_patientId_medicineId: { tenantId, patientId, medicineId },
      },
      create: {
        tenantId,
        patientId,
        medicineId,
        ...data,
      },
      update: data,
    });
  }

  async findUpcomingRefills(tenantId, daysAhead = 7) {
    const now = new Date();
    const deadline = new Date();
    deadline.setDate(deadline.getDate() + daysAhead);

    return prisma.patientRefill.findMany({
      where: {
        tenantId,
        expectedRefillAt: { gte: now, lte: deadline },
        adherenceStatus: { in: ['ON_TRACK', 'AT_RISK'] },
      },
      include: {
        patient: { select: { id: true, fullName: true, phone: true, email: true } },
        medicine: { select: { id: true, fullName: true } },
      },
      orderBy: { expectedRefillAt: 'asc' },
    });
  }

  async createAdherenceLog(data) {
    return prisma.patientAdherence.create({ data });
  }

  async createReminder(data) {
    return prisma.patientRefillReminder.create({ data });
  }

  async updateReminderStatus(reminderId, data) {
    return prisma.patientRefillReminder.update({
      where: { id: reminderId },
      data,
    });
  }

  async findRemindersByPatient(patientId, tenantId) {
    return prisma.patientRefillReminder.findMany({
      where: { patientId, tenantId },
      orderBy: { scheduledAt: 'desc' },
      take: 50,
    });
  }

  async findAdherenceSummary(patientId, tenantId) {
    return prisma.patientAdherence.findMany({
      where: { patientId, tenantId },
      orderBy: { calculatedAt: 'desc' },
      take: 10,
    });
  }
}

export default new RefillRepository();
