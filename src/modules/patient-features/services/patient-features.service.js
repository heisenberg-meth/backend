import repo from '../repositories/patient-features.repository.js';
import { emitEvent } from '../../../shared/events/erp-event-bus.js';
import redisClient from '../../../config/redis.js';

const CHRONIC_THRESHOLD = 3;
const CHRONIC_WINDOW_MONTHS = 6;
const SCHEDULE_RESTRICTED = ['H', 'H1', 'X'];

function daysBetween(a, b) {
  return Math.round((new Date(b) - new Date(a)) / 86400000);
}

class PatientFeaturesService {
  async _verifyPatient(id, tenantId) {
    const patient = await repo.findCustomerById(id, tenantId);
    if (!patient) {
      const err = new Error('Patient not found');
      err.statusCode = 404;
      throw err;
    }
    return patient;
  }

  async _invalidateCache(tenantId, patientId) {
    await redisClient.del(`patient:${tenantId}:${patientId}:*`);
  }

  async _audit(tenantId, patientId, action, meta = {}) {
    await repo.createAuditLog({ tenantId, patientId, action, ...meta });
  }

  async getPurchaseHistory(id, tenantId, query) {
    await this._verifyPatient(id, tenantId);
    await this._audit(tenantId, id, 'HISTORY_ACCESS', { description: 'Purchase history accessed' });

    const { sales, total, page, limit } = await repo.findPurchaseHistory(id, tenantId, query);
    const medicineFreq = await repo.findMedicinePurchaseFrequency(
      id,
      tenantId,
      CHRONIC_WINDOW_MONTHS,
    );

    const chronicMedicines = medicineFreq.filter((m) => m.purchaseCount >= CHRONIC_THRESHOLD);
    const purchases = sales.flatMap((sale) =>
      sale.items.map((item) => ({
        invoiceId: sale.invoiceId,
        medicineName: item.medicine.name,
        quantity: item.quantity,
        purchasedAt: sale.soldAt,
      })),
    );

    return {
      patientId: id,
      summary: {
        totalPurchases: total,
        chronicMedicines: chronicMedicines.length,
      },
      purchases,
      pagination: { page, limit, total },
    };
  }

  async getPrescriptions(id, tenantId) {
    await this._verifyPatient(id, tenantId);
    await this._audit(tenantId, id, 'PRESCRIPTION_ACCESS', {
      description: 'Prescriptions accessed',
    });

    const prescriptions = await repo.findPrescriptions(id, tenantId);
    const now = new Date();

    return {
      prescriptions: prescriptions.map((p) => {
        const maxDuration = Math.max(0, ...p.items.map((i) => i.durationDays || 0));
        const expiryDate = new Date(p.prescriptionDate);
        expiryDate.setDate(expiryDate.getDate() + maxDuration);

        const scheduleDrugs = p.items
          .filter(
            (i) => i.medicine.scheduleType && SCHEDULE_RESTRICTED.includes(i.medicine.scheduleType),
          )
          .map((i) => ({
            medicineName: i.medicine.name,
            scheduleType: i.medicine.scheduleType,
          }));

        return {
          prescriptionId: p.id,
          doctorName: p.doctorName,
          doctorId: p.doctor?.id || null,
          doctorSpecialization: p.doctor?.specialization || null,
          issuedDate: p.prescriptionDate,
          expiryDate,
          isExpired: expiryDate < now,
          verificationStatus: p.verificationStatus,
          medicines: p.items.map((i) => ({
            medicineId: i.medicineId,
            medicineName: i.medicine.name,
            dosage: i.dosage,
            quantity: i.quantity,
            durationDays: i.durationDays,
            instructions: i.instructions,
            scheduleType: i.medicine.scheduleType,
            prescriptionRequired: i.medicine.prescriptionRequired,
          })),
          scheduleDrugs,
        };
      }),
    };
  }

  async getInvoices(id, tenantId, query) {
    await this._verifyPatient(id, tenantId);

    const result = await repo.findInvoices(id, tenantId, query);
    return {
      patientId: id,
      invoices: result.invoices.map((inv) => ({
        invoiceId: inv.id,
        invoiceNumber: inv.invoiceNumber,
        amount: inv.totalAmount,
        paidAmount: inv.paidAmount,
        paymentStatus: inv.paymentStatus,
        status: inv.status,
        createdAt: inv.createdAt,
      })),
      pagination: { page: result.page, limit: result.limit, total: result.total },
    };
  }

  async getRefills(id, tenantId) {
    await this._verifyPatient(id, tenantId);
    await this._audit(tenantId, id, 'REFILL_ACCESS', {
      description: 'Refill predictions accessed',
    });

    const [medicineFreq, subscriptions, existingRefills] = await Promise.all([
      repo.findMedicinePurchaseFrequency(id, tenantId, 12),
      repo.findMedicineSubscriptions(id, tenantId),
      repo.findRefillRecords(id, tenantId),
    ]);

    const refills = [];

    for (const mf of medicineFreq) {
      if (mf.purchaseCount < 2) continue;

      const sub = subscriptions.find((s) => s.medicineId === mf.medicineId);

      let dailyConsumption = 1;
      if (sub && sub.frequencyDays > 0 && sub.quantity > 0) {
        dailyConsumption = sub.quantity / sub.frequencyDays;
      } else if (mf.purchaseDates.length >= 2) {
        const sorted = [...mf.purchaseDates].sort((a, b) => a - b);
        const intervals = [];
        for (let i = 1; i < sorted.length; i++) {
          intervals.push(daysBetween(sorted[i - 1], sorted[i]));
        }
        const avgInterval = intervals.reduce((s, v) => s + v, 0) / intervals.length;
        const avgQty = mf.totalQuantity / mf.purchaseCount;
        dailyConsumption = avgInterval > 0 ? avgQty / avgInterval : 1;
      }

      dailyConsumption = Math.max(0.1, dailyConsumption);

      const lastSale = await repo.findRecentSalesByMedicine(id, tenantId, mf.medicineId, 1);
      const lastPurchase = lastSale[0]?.soldAt || mf.lastPurchase;

      let expectedRefillAt = null;
      if (lastPurchase && dailyConsumption > 0) {
        const lastQty = lastSale[0]?.items[0]?.quantity || mf.totalQuantity / mf.purchaseCount;
        const daysUntilRefill = Math.round(lastQty / dailyConsumption);
        expectedRefillAt = new Date(lastPurchase.getTime() + daysUntilRefill * 86400000);
      }

      let adherenceStatus = 'ON_TRACK';
      if (expectedRefillAt) {
        const now = new Date();
        const daysOverdue = daysBetween(expectedRefillAt, now);
        if (daysOverdue > 14) adherenceStatus = 'CRITICAL';
        else if (daysOverdue > 7) adherenceStatus = 'MISSED';
        else if (daysOverdue > 3) adherenceStatus = 'AT_RISK';
      }

      await repo.upsertRefillPrediction(tenantId, id, mf.medicineId, {
        lastPurchaseDate: lastPurchase,
        expectedRefillAt,
        dailyConsumption,
        adherenceStatus,
      });

      refills.push({
        medicineId: mf.medicineId,
        medicineName: mf.medicineName,
        lastPurchasedAt: lastPurchase,
        expectedRefillDate: expectedRefillAt,
        dailyConsumption: Math.round(dailyConsumption * 100) / 100,
        adherenceStatus,
        daysUntilRefill: expectedRefillAt
          ? Math.max(0, daysBetween(new Date(), expectedRefillAt))
          : null,
      });
    }

    if (existingRefills.length > 0 && refills.length === 0) {
      for (const er of existingRefills) {
        refills.push({
          medicineId: er.medicine.id,
          medicineName: er.medicine.name,
          lastPurchasedAt: er.lastPurchaseDate,
          expectedRefillDate: er.expectedRefillAt,
          adherenceStatus: er.adherenceStatus,
          daysUntilRefill: er.expectedRefillAt
            ? Math.max(0, daysBetween(new Date(), er.expectedRefillAt))
            : null,
        });
      }
    }

    return { patientId: id, refills };
  }

  async getTimeline(id, tenantId) {
    await this._verifyPatient(id, tenantId);

    const data = await repo.findTimeline(id, tenantId);
    const events = [];

    for (const sale of data.sales) {
      events.push({
        type: 'PURCHASE',
        id: sale.id,
        description: `Purchased items worth ₹${sale.totalAmount}`,
        medicineSummary: sale.items.map((i) => `${i.quantity}x ${i.medicine.name}`).join(', '),
        amount: sale.totalAmount,
        timestamp: sale.soldAt,
      });
    }

    for (const p of data.prescriptions) {
      events.push({
        type: 'PRESCRIPTION',
        id: p.id,
        description: `Prescription${p.doctorName ? ` by ${p.doctorName}` : ''}`,
        status: p.verificationStatus,
        timestamp: p.prescriptionDate,
      });
    }

    for (const inv of data.invoices) {
      events.push({
        type: 'INVOICE',
        id: inv.id,
        description: `Invoice ${inv.invoiceNumber} — ₹${inv.totalAmount}`,
        amount: inv.totalAmount,
        paymentStatus: inv.paymentStatus,
        timestamp: inv.createdAt,
      });
    }

    for (const ref of data.refills) {
      events.push({
        type: 'REFILL',
        id: ref.id,
        description: `${ref.medicine.name} refill ${ref.adherenceStatus.toLowerCase().replace('_', ' ')}`,
        adherenceStatus: ref.adherenceStatus,
        timestamp: ref.expectedRefillAt,
      });
    }

    events.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    return { patientId: id, events };
  }

  async getAdherenceSummary(id, tenantId) {
    await this._verifyPatient(id, tenantId);

    const refills = await repo.countAdherenceByStatus(id, tenantId);
    const counts = { ON_TRACK: 0, AT_RISK: 0, MISSED: 0, CRITICAL: 0 };

    for (const r of refills) {
      counts[r.adherenceStatus] = (counts[r.adherenceStatus] || 0) + 1;
    }

    const total = refills.length;
    const adherenceRate =
      total > 0 ? Math.round(((counts.ON_TRACK + counts.AT_RISK) / total) * 100) : null;

    const atRisk = counts.AT_RISK + counts.MISSED + counts.CRITICAL;
    if (atRisk > 0) {
      await emitEvent('ADHERENCE_RISK_DETECTED', {
        patientId: id,
        tenantId,
        adherenceRate,
        atRiskCount: atRisk,
      });
    }

    return {
      patientId: id,
      totalTracked: total,
      adherenceRate,
      summary: counts,
    };
  }

  async getChronicMedicines(id, tenantId) {
    await this._verifyPatient(id, tenantId);

    const medicineFreq = await repo.findMedicinePurchaseFrequency(
      id,
      tenantId,
      CHRONIC_WINDOW_MONTHS,
    );
    const chronic = medicineFreq.filter((m) => m.purchaseCount >= CHRONIC_THRESHOLD);

    return {
      patientId: id,
      chronicMedicines: chronic.map((m) => ({
        medicineId: m.medicineId,
        medicineName: m.medicineName,
        genericName: m.genericName,
        purchaseCount: m.purchaseCount,
        totalQuantity: m.totalQuantity,
        lastPurchase: m.lastPurchase,
        detectedAsChronic: m.purchaseCount >= CHRONIC_THRESHOLD,
      })),
    };
  }

  async getUpcomingRefills(tenantId, daysAhead = 7) {
    const refills = await repo.findUpcomingRefills(tenantId, daysAhead);

    return {
      tenantId,
      count: refills.length,
      refills: refills.map((r) => ({
        patientId: r.patient.id,
        patientName: r.patient.fullName,
        patientPhone: r.patient.phone,
        medicineId: r.medicine.id,
        medicineName: r.medicine.name,
        expectedRefillDate: r.expectedRefillAt,
        adherenceStatus: r.adherenceStatus,
      })),
    };
  }

  async checkPrescriptionValidity(prescriptionId, tenantId) {
    const p = await repo.findPrescriptionById(prescriptionId, tenantId);
    if (!p) {
      const err = new Error('Prescription not found');
      err.statusCode = 404;
      throw err;
    }

    const now = new Date();
    const maxDuration = Math.max(0, ...p.items.map((i) => i.durationDays || 0));
    const expiryDate = new Date(p.prescriptionDate);
    expiryDate.setDate(expiryDate.getDate() + maxDuration);

    const hasScheduleDrugs = p.items.some(
      (i) => i.medicine.scheduleType && SCHEDULE_RESTRICTED.includes(i.medicine.scheduleType),
    );

    const isExpired = expiryDate < now;

    if (isExpired) {
      await emitEvent('PRESCRIPTION_EXPIRED', {
        prescriptionId,
        patientId: p.patientId,
        tenantId,
        doctorName: p.doctorName,
        expiredAt: expiryDate,
      });
    }

    return {
      prescriptionId: p.id,
      isExpired,
      expiryDate,
      hasScheduleDrugs,
      scheduleDrugs: p.items
        .filter(
          (i) => i.medicine.scheduleType && SCHEDULE_RESTRICTED.includes(i.medicine.scheduleType),
        )
        .map((i) => ({ medicineName: i.medicine.name, scheduleType: i.medicine.scheduleType })),
      isRefillBlocked: isExpired || (hasScheduleDrugs && isExpired),
    };
  }
}

export default new PatientFeaturesService();
