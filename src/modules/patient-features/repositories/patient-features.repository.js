import prisma from '../../../config/prisma.js';

class PatientFeaturesRepository {
  async findCustomerById(id, tenantId) {
    return prisma.patient.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: {
        _count: { select: { sales: true } },
      },
    });
  }

  async findPurchaseHistory(id, tenantId, filters) {
    const { from, to, page = 1, limit = 50 } = filters;
    const skip = (page - 1) * limit;

    const where = { patientId: id, tenantId, status: 'COMPLETED' };
    if (from || to) {
      where.soldAt = {};
      if (from) where.soldAt.gte = new Date(from);
      if (to) where.soldAt.lte = new Date(to);
    }

    const [sales, total] = await Promise.all([
      prisma.sale.findMany({
        where,
        include: {
          items: {
            include: { medicine: { select: { id: true, name: true, genericName: true } } },
          },
        },
        orderBy: { soldAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.sale.count({ where }),
    ]);

    return { sales, total, page, limit };
  }

  async findMedicinePurchaseFrequency(id, tenantId, monthsBack = 6) {
    const since = new Date();
    since.setMonth(since.getMonth() - monthsBack);

    const sales = await prisma.sale.findMany({
      where: {
        patientId: id,
        tenantId,
        status: 'COMPLETED',
        soldAt: { gte: since },
      },
      include: {
        items: {
          include: { medicine: { select: { id: true, name: true, genericName: true } } },
        },
      },
    });

    const freq = {};
    for (const sale of sales) {
      for (const item of sale.items) {
        const key = item.medicineId;
        if (!freq[key]) {
          freq[key] = {
            medicineId: item.medicineId,
            medicineName: item.medicine.name,
            genericName: item.medicine.genericName,
            purchaseCount: 0,
            totalQuantity: 0,
            lastPurchase: null,
            purchaseDates: [],
          };
        }
        freq[key].purchaseCount += 1;
        freq[key].totalQuantity += item.quantity;
        freq[key].purchaseDates.push(sale.soldAt);
        if (!freq[key].lastPurchase || sale.soldAt > freq[key].lastPurchase) {
          freq[key].lastPurchase = sale.soldAt;
        }
      }
    }
    return Object.values(freq).sort((a, b) => b.purchaseCount - a.purchaseCount);
  }

  async findPrescriptions(id, tenantId) {
    return prisma.prescription.findMany({
      where: { patientId: id, tenantId, deletedAt: null },
      include: {
        items: {
          include: {
            medicine: { select: { id: true, name: true, scheduleType: true, prescriptionRequired: true } },
          },
        },
        doctor: { select: { id: true, doctorName: true, specialization: true, registrationNumber: true } },
        user: { select: { fullName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findPrescriptionById(prescriptionId, tenantId) {
    return prisma.prescription.findFirst({
      where: { id: prescriptionId, tenantId, deletedAt: null },
      include: {
        items: {
          include: {
            medicine: { select: { id: true, name: true, scheduleType: true } },
          },
        },
        doctor: true,
      },
    });
  }

  async findDoctorPrescriptions(doctorId, tenantId) {
    return prisma.prescription.count({
      where: { doctorId, tenantId, deletedAt: null },
    });
  }

  async findInvoices(id, tenantId, filters) {
    const { from, to, page = 1, limit = 50 } = filters;
    const skip = (page - 1) * limit;

    const where = { patientId: id, tenantId, deletedAt: null };
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) where.createdAt.lte = new Date(to);
    }

    const [invoices, total] = await Promise.all([
      prisma.invoice.findMany({
        where,
        select: {
          id: true,
          invoiceNumber: true,
          totalAmount: true,
          paidAmount: true,
          paymentStatus: true,
          status: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.invoice.count({ where }),
    ]);

    return { invoices, total, page, limit };
  }

  async findRefillRecords(id, tenantId) {
    return prisma.patientRefill.findMany({
      where: { patientId: id, tenantId },
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

  async findMedicineSubscriptions(id, tenantId) {
    return prisma.medicineSubscription.findMany({
      where: { patientId: id, tenantId, subscriptionStatus: 'ACTIVE' },
      include: { medicine: { select: { id: true, name: true } } },
    });
  }

  async countSalesInPeriod(id, tenantId, since) {
    return prisma.sale.count({
      where: {
        patientId: id,
        tenantId,
        status: 'COMPLETED',
        soldAt: { gte: since },
      },
    });
  }

  async findRecentSalesByMedicine(id, tenantId, medicineId, limit = 5) {
    return prisma.sale.findMany({
      where: {
        patientId: id,
        tenantId,
        status: 'COMPLETED',
        items: { some: { medicineId } },
      },
      include: {
        items: {
          where: { medicineId },
          select: { quantity: true, unitPrice: true },
        },
      },
      orderBy: { soldAt: 'desc' },
      take: limit,
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
        patient: { select: { id: true, fullName: true, phone: true } },
        medicine: { select: { id: true, fullName: true } },
      },
      orderBy: { expectedRefillAt: 'asc' },
    });
  }

  async findTimeline(id, tenantId) {
    const [sales, prescriptions, invoices, refills] = await Promise.all([
      prisma.sale.findMany({
        where: { patientId: id, tenantId, status: 'COMPLETED' },
        select: {
          id: true,
          totalAmount: true,
          soldAt: true,
          items: {
            select: { quantity: true, medicine: { select: { name: true } } },
            take: 3,
          },
        },
        orderBy: { soldAt: 'desc' },
        take: 20,
      }),
      prisma.prescription.findMany({
        where: { patientId: id, tenantId, deletedAt: null },
        select: {
          id: true,
          doctorName: true,
          prescriptionDate: true,
          verificationStatus: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      prisma.invoice.findMany({
        where: { patientId: id, tenantId, deletedAt: null },
        select: {
          id: true,
          invoiceNumber: true,
          totalAmount: true,
          paymentStatus: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      prisma.patientRefill.findMany({
        where: { patientId: id, tenantId },
        select: {
          id: true,
          expectedRefillAt: true,
          adherenceStatus: true,
          medicine: { select: { name: true } },
        },
        orderBy: { expectedRefillAt: 'desc' },
        take: 20,
      }),
    ]);

    return { sales, prescriptions, invoices, refills };
  }

  async countAdherenceByStatus(id, tenantId) {
    const refills = await prisma.patientRefill.findMany({
      where: { patientId: id, tenantId },
      select: { adherenceStatus: true },
    });
    return refills;
  }

  async assignDoctorToPrescription(prescriptionId, doctorId, tenantId) {
    return prisma.prescription.update({
      where: { id: prescriptionId, tenantId },
      data: { doctorId },
    });
  }

  async createAuditLog(data) {
    return prisma.patientAuditLog.create({ data });
  }
}

export default new PatientFeaturesRepository();