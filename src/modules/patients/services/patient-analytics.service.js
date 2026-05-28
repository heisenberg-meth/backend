import prisma from '../../../config/prisma.js';
import { subDays } from 'date-fns';

class PatientAnalyticsService {
  async getPatientAnalytics(patientId, tenantId) {
    const patient = await prisma.patient.findFirst({
      where: { id: patientId, tenantId, deletedAt: null },
      include: {
        _count: { select: { prescriptions: true, invoices: true, sales: true, returns: true } },
        patientAdherence: { orderBy: { createdAt: 'desc' }, take: 30 },
      },
    });

    if (!patient) throw new Error('Patient not found');

    const adherenceEntries = patient.patientAdherence;
    const adherenceRate = adherenceEntries.length
      ? Math.round(adherenceEntries.filter(a => a.taken).length / adherenceEntries.length * 100)
      : null;

    return {
      patientId: patient.id,
      patientName: patient.fullName,
      patientCode: patient.patientCode,
      totalPrescriptions: patient._count.prescriptions,
      totalInvoices: patient._count.invoices,
      totalPurchases: patient._count.sales,
      totalReturns: patient._count.returns,
      totalSpent: patient.totalSpent,
      totalVisits: patient.totalVisits,
      loyaltyPoints: patient.loyaltyPoints,
      lastPurchaseDate: patient.lastPurchaseDate,
      adherenceRate,
      chronicConditions: patient.chronicConditions || [],
      allergies: patient.allergies || [],
      insuranceProvider: patient.insuranceProvider,
    };
  }

  async getChronicIntelligence(tenantId) {
    const patients = await prisma.patient.findMany({
      where: {
        tenantId,
        deletedAt: null,
        chronicConditions: { not: null },
      },
      select: {
        id: true,
        fullName: true,
        chronicConditions: true,
        totalVisits: true,
        lastPurchaseDate: true,
        patientAdherence: { orderBy: { createdAt: 'desc' }, take: 30 },
        _count: { select: { prescriptions: true, invoices: true } },
      },
    });

    return patients.map(p => {
      const conditions = p.chronicConditions || [];
      const adherenceEntries = p.patientAdherence;
      const adherenceRate = adherenceEntries.length
        ? Math.round(adherenceEntries.filter(a => a.taken).length / adherenceEntries.length * 100)
        : null;

      return {
        patientId: p.id,
        patientName: p.fullName,
        conditions,
        conditionCount: conditions.length,
        totalPrescriptions: p._count.prescriptions,
        totalInvoices: p._count.invoices,
        totalVisits: p.totalVisits,
        lastVisit: p.lastPurchaseDate,
        adherenceRate,
        risk: adherenceRate !== null && adherenceRate < 60 ? 'HIGH' : adherenceRate !== null && adherenceRate < 80 ? 'MEDIUM' : 'LOW',
      };
    });
  }

  async getPurchasePatterns(tenantId) {
    const ninetyDaysAgo = subDays(new Date(), 90);
    const frequent = await prisma.patient.count({
      where: {
        tenantId,
        deletedAt: null,
        totalVisits: { gte: 5 },
        lastPurchaseDate: { gte: ninetyDaysAgo },
      },
    });

    const atRisk = await prisma.patient.count({
      where: {
        tenantId,
        deletedAt: null,
        lastPurchaseDate: { lt: subDays(new Date(), 90), gt: subDays(new Date(), 180) },
      },
    });

    const churned = await prisma.patient.count({
      where: {
        tenantId,
        deletedAt: null,
        lastPurchaseDate: { lt: subDays(new Date(), 180) },
      },
    });

    const newPatients = await prisma.patient.count({
      where: {
        tenantId,
        deletedAt: null,
        createdAt: { gte: subDays(new Date(), 30) },
      },
    });

    return { frequent, atRisk, churned, newPatients };
  }

  async getDemographics(tenantId) {
    const patients = await prisma.patient.findMany({
      where: { tenantId, deletedAt: null },
      select: { gender: true, age: true, bloodGroup: true },
    });

    const total = patients.length;
    const genderBreakdown = {};
    const ageGroups = { '0-18': 0, '19-35': 0, '36-50': 0, '51-65': 0, '65+': 0 };
    const bloodGroups = {};

    for (const p of patients) {
      if (p.gender) genderBreakdown[p.gender] = (genderBreakdown[p.gender] || 0) + 1;
      if (p.bloodGroup) bloodGroups[p.bloodGroup] = (bloodGroups[p.bloodGroup] || 0) + 1;
      if (p.age !== null && p.age !== undefined) {
        if (p.age <= 18) ageGroups['0-18']++;
        else if (p.age <= 35) ageGroups['19-35']++;
        else if (p.age <= 50) ageGroups['36-50']++;
        else if (p.age <= 65) ageGroups['51-65']++;
        else ageGroups['65+']++;
      }
    }

    return { total, genderBreakdown, ageGroups, bloodGroups };
  }
}

export default new PatientAnalyticsService();
