import refillService from '../services/refill.service.js';
import prisma from '../../../config/prisma.js';
import logger from '../../../shared/utils/logger.js';

export async function processRefillPredictions() {
  logger.info('[REFILL] Starting refill prediction update...');
  const tenants = await prisma.tenant.findMany({ where: { deletedAt: null } });

  for (const tenant of tenants) {
    // Get all patients who made purchases in the last 30 days
    const recentPurchasers = await prisma.sale.findMany({
      where: {
        tenantId: tenant.id,
        soldAt: { gte: new Date(Date.now() - 30 * 86400000) },
        patientId: { not: null }
      },
      select: { patientId: true },
      distinct: ['patientId']
    });

    for (const { patientId } of recentPurchasers) {
      const medicines = await prisma.saleItem.findMany({
        where: { sale: { patientId, tenantId: tenant.id } },
        select: { medicineId: true },
        distinct: ['medicineId']
      });

      for (const { medicineId } of medicines) {
        await refillService.predictRefill(patientId, medicineId, tenant.id);
      }
    }
  }
  logger.info('[REFILL] Refill prediction update complete');
}

export async function processAdherenceScoring() {
  logger.info('[REFILL] Starting adherence scoring...');
  const tenants = await prisma.tenant.findMany({ where: { deletedAt: null } });

  for (const tenant of tenants) {
    const refills = await prisma.patientRefill.findMany({
      where: { tenantId: tenant.id }
    });

    for (const refill of refills) {
      await refillService.calculateAdherence(refill.patientId, refill.medicineId, tenant.id);
    }
  }
  logger.info('[REFILL] Adherence scoring complete');
}

export async function processScheduledReminders() {
  logger.info('[REFILL] Starting scheduled reminders...');
  const tenants = await prisma.tenant.findMany({ where: { deletedAt: null } });

  for (const tenant of tenants) {
    await refillService.processUpcomingReminders(tenant.id);
  }
  logger.info('[REFILL] Scheduled reminders complete');
}
