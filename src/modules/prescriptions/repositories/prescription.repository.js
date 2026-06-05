import prisma from '../../../config/prisma.js';

class PrescriptionRepository {
  async createPrescription(data, items, tx) {
    const client = tx || prisma;
    return client.prescription.create({
      data: {
        ...data,
        items: { create: items },
      },
      include: {
        items: { include: { medicine: true } },
        patient: { select: { fullName: true } },
        doctor: true,
      },
    });
  }

  async findPrescriptionById(id) {
    return prisma.prescription.findUnique({
      where: { id },
      include: {
        items: { include: { medicine: true } },
        patient: { select: { fullName: true } },
        doctor: true,
        verifications: {
          include: { user: { select: { fullName: true } } },
          orderBy: { verifiedAt: 'desc' },
        },
        invoices: { select: { id: true, invoiceNumber: true, totalAmount: true, createdAt: true } },
      },
    });
  }

  async findPrescriptions(tenantId, options = {}) {
    const { status, verificationStatus, patientId, doctorId, verified, from, to, limit, offset } =
      options;
    const where = { tenantId, deletedAt: null };

    if (status) where.status = status;
    if (verificationStatus) where.verificationStatus = verificationStatus;
    if (patientId) where.patientId = patientId;
    if (doctorId) where.doctorId = doctorId;
    if (verified !== undefined) where.verifiedBy = verified === 'true' ? { not: null } : null;
    if (from || to) {
      where.prescriptionDate = {};
      if (from) where.prescriptionDate.gte = new Date(from);
      if (to) where.prescriptionDate.lte = new Date(to);
    }

    const [data, total] = await Promise.all([
      prisma.prescription.findMany({
        where,
        include: {
          items: { select: { id: true } },
          patient: { select: { fullName: true } },
          doctor: { select: { doctorName: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: limit || 50,
        skip: offset || 0,
      }),
      prisma.prescription.count({ where }),
    ]);

    return { data, total };
  }

  async updatePrescription(id, data, tx) {
    const client = tx || prisma;
    return client.prescription.update({ where: { id }, data });
  }

  async softDeletePrescription(id, tx) {
    const client = tx || prisma;
    return client.prescription.update({
      where: { id },
      data: { status: 'ARCHIVED', deletedAt: new Date() },
    });
  }

  async createVerification(data, tx) {
    const client = tx || prisma;
    return client.prescriptionVerification.create({ data });
  }

  async findPrescriptionsByPatient(patientId, tenantId, options = {}) {
    const { limit } = options;
    return prisma.prescription.findMany({
      where: { patientId, tenantId, deletedAt: null },
      include: {
        items: { include: { medicine: { select: { name: true, scheduleType: true } } } },
        doctor: { select: { doctorName: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit || 10,
    });
  }

  async getDispensingHistory(prescriptionId) {
    return prisma.invoice.findMany({
      where: { prescriptionId, deletedAt: null },
      include: {
        items: {
          include: { medicine: { select: { name: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getRefills(prescriptionId) {
    const prescription = await prisma.prescription.findUnique({
      where: { id: prescriptionId },
      select: {
        id: true,
        refillCount: true,
        refillMax: true,
        patientId: true,
        items: {
          include: { medicine: { select: { name: true, id: true } } },
        },
      },
    });

    return prescription;
  }

  async createRefillReminder(data) {
    return prisma.medicineReminder.create({ data });
  }

  async getPrescriptionAnalytics(tenantId, options = {}) {
    const { from, to } = options;
    const where = { tenantId, deletedAt: null };
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) where.createdAt.lte = new Date(to);
    }

    const [total, byStatus, byVerification, recent] = await Promise.all([
      prisma.prescription.count({ where }),
      prisma.prescription.groupBy({
        by: ['status'],
        where,
        _count: true,
      }),
      prisma.prescription.groupBy({
        by: ['verificationStatus'],
        where,
        _count: true,
      }),
      prisma.prescription.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: 5,
        include: {
          patient: { select: { fullName: true } },
          doctor: { select: { doctorName: true } },
        },
      }),
    ]);

    return { total, byStatus, byVerification, recent };
  }
}

export default new PrescriptionRepository();
