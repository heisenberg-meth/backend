import { localEventBus } from './local-event-bus.js';
import { DOMAIN_EVENTS } from '../constants/events.js';
import { PURCHASE_ORDER_STATUS } from '../constants/purchase-order-status.js';
import prisma from '../../config/prisma.js';
import logger from '../utils/logger.js';
import { initSupplierListeners } from '../../modules/suppliers/events/supplier.listeners.js';

/**
 * ERP Event Listeners Initialization
 * This ties the decoupled modules together asynchronously.
 * All listeners are in-process (localEventBus) for single-instance deployments.
 * For distributed deployments, use erpEventBus (BullMQ) with dedicated workers.
 */
export const initListeners = () => {
  logger.info('[EVENT-LISTENERS] Initializing ERP Domain Listeners...');

  // Initialize Module Specific Listeners
  initSupplierListeners();

  // ── INVENTORY LISTENERS ─────────────────────────────────────

  localEventBus.on(DOMAIN_EVENTS.STOCK_LOW, async (data) => {
    const { medicineId, tenantId, quantity, name, branchId } = data;
    logger.warn({ medicineId, name, quantity }, '[ALERT] Low stock detected');

    try {
      const existing = await prisma.stockAlert.findFirst({
        where: {
          medicineId,
          tenantId,
          branchId: branchId || null,
          isResolved: false,
          type: 'LOW_STOCK',
        },
      });

      if (!existing) {
        await prisma.stockAlert.create({
          data: {
            tenantId,
            medicineId,
            branchId: branchId || null,
            type: 'LOW_STOCK',
            severity: quantity === 0 ? 'CRITICAL' : 'WARNING',
            message: `Stock for ${name} is low: ${quantity} units remaining.`,
            currentStock: quantity,
            isResolved: false,
          },
        });
        logger.info({ medicineId, name }, '[ALERT] Created StockAlert for low stock');
      }

      // Queue dashboard cache refresh for inventory and alerts
      const { queueDashboardRefresh } =
        await import('../../modules/dashboard/workers/dashboard.worker.js');
      await queueDashboardRefresh(tenantId, branchId, 'INVENTORY_HEALTH');
      await queueDashboardRefresh(tenantId, branchId, 'ALERTS');
    } catch (err) {
      logger.error({ err, medicineId }, '[ALERT-LISTENER] Failed to handle STOCK_LOW');
    }
  });

  localEventBus.on(DOMAIN_EVENTS.STOCK_OUT, async (data) => {
    const { medicineId, tenantId, name, branchId } = data;
    logger.error({ medicineId, name }, '[ALERT] Stock out detected');

    try {
      await prisma.stockAlert.create({
        data: {
          tenantId,
          medicineId,
          branchId: branchId || null,
          type: 'OUT_OF_STOCK',
          severity: 'CRITICAL',
          message: `${name} is out of stock.`,
          currentStock: 0,
          isResolved: false,
        },
      });

      // Queue dashboard cache refresh for inventory and alerts
      const { queueDashboardRefresh } =
        await import('../../modules/dashboard/workers/dashboard.worker.js');
      await queueDashboardRefresh(tenantId, branchId, 'INVENTORY_HEALTH');
      await queueDashboardRefresh(tenantId, branchId, 'ALERTS');
    } catch (err) {
      logger.error({ err, medicineId }, '[ALERT-LISTENER] Failed to handle STOCK_OUT');
    }
  });

  localEventBus.on(DOMAIN_EVENTS.BATCH_EXPIRING, async (data) => {
    const { batchId, medicineId, tenantId, name, daysRemaining, branchId } = data;
    logger.warn({ batchId, name, daysRemaining }, '[ALERT] Batch expiring soon');

    try {
      await prisma.expiryAlert.create({
        data: {
          tenantId,
          batchId,
          medicineId,
          branchId: branchId || null,
          severity: daysRemaining <= 7 ? 'CRITICAL' : 'WARNING',
          daysRemaining,
          message: `${name} batch expires in ${daysRemaining} days.`,
          isResolved: false,
        },
      });

      // Queue dashboard cache refresh for inventory and alerts
      const { queueDashboardRefresh } =
        await import('../../modules/dashboard/workers/dashboard.worker.js');
      await queueDashboardRefresh(tenantId, branchId, 'INVENTORY_HEALTH');
      await queueDashboardRefresh(tenantId, branchId, 'ALERTS');
    } catch (err) {
      logger.error({ err, batchId }, '[ALERT-LISTENER] Failed to handle BATCH_EXPIRING');
    }
  });

  localEventBus.on(DOMAIN_EVENTS.MEDICINE_ARCHIVED, async (data) => {
    const { medicineId, tenantId, name, archivedBy } = data;
    logger.info({ medicineId, name, archivedBy }, '[INVENTORY] Medicine archived');

    try {
      await prisma.auditLog.create({
        data: {
          tenantId,
          userId: null,
          action: 'MEDICINE_ARCHIVED',
          target: `Medicine: ${name} (${medicineId})`,
          type: 'INVENTORY',
        },
      });
    } catch (err) {
      logger.error({ err, medicineId }, '[AUDIT-LISTENER] Failed to log medicine archive');
    }
  });

  // ── BILLING LISTENERS ───────────────────────────────────────

  localEventBus.on(DOMAIN_EVENTS.SALE_COMPLETED, async (data) => {
    const { invoiceId, total, items, patientId, tenantId } = data;
    logger.info({ invoiceId, total, itemCount: items?.length }, '[SALE] Sale completed');

    try {
      // Update patient purchase stats
      if (patientId) {
        await prisma.patient.update({
          where: { id: patientId },
          data: {
            totalSpent: { increment: total },
            totalVisits: { increment: 1 },
            lastPurchaseDate: new Date(),
          },
        });
      }

      // Create daily sales summary entry (upsert)
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      await prisma.dailySalesSummary.upsert({
        where: {
          tenantId_branchId_salesDate: {
            tenantId,
            branchId: data.branchId || null,
            salesDate: today,
          },
        },
        update: {
          totalSales: { increment: total },
          totalInvoices: { increment: 1 },
          totalItemsSold: { increment: items?.length || 0 },
        },
        create: {
          tenantId,
          branchId: data.branchId || null,
          salesDate: today,
          totalSales: total,
          totalInvoices: 1,
          totalItemsSold: items?.length || 0,
        },
      });

      // Queue dashboard cache refresh for sales-related sections
      const { queueDashboardRefresh } =
        await import('../../modules/dashboard/workers/dashboard.worker.js');
      await queueDashboardRefresh(tenantId, data.branchId, 'SALES_SUMMARY');
      await queueDashboardRefresh(tenantId, data.branchId, 'OVERVIEW');
    } catch (err) {
      logger.error({ err, invoiceId }, '[SALE-LISTENER] Failed to process sale completion');
    }
  });

  localEventBus.on(DOMAIN_EVENTS.INVOICE_CANCELLED, async (data) => {
    const { invoiceId, reason, tenantId } = data;
    logger.warn({ invoiceId, reason }, '[BILLING] Invoice cancelled');

    try {
      await prisma.auditLog.create({
        data: {
          tenantId,
          action: 'INVOICE_CANCELLED',
          target: `Invoice: ${invoiceId}`,
          type: 'FINANCIAL',
        },
      });
    } catch (err) {
      logger.error({ err, invoiceId }, '[AUDIT-LISTENER] Failed to log invoice cancellation');
    }
  });

  localEventBus.on(DOMAIN_EVENTS.SALE_CANCELLED, async (data) => {
    const { invoiceId, tenantId, branchId, reason } = data;
    logger.warn({ invoiceId, reason }, '[SALE] Sale cancelled, updating daily summary');

    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      await prisma.dailySalesSummary.updateMany({
        where: {
          tenantId,
          branchId: branchId || null,
          salesDate: today,
        },
        data: {
          totalInvoices: { decrement: 1 },
        },
      });
    } catch (err) {
      logger.error({ err, invoiceId }, '[SALE-LISTENER] Failed to update daily summary on cancel');
    }
  });

  localEventBus.on(DOMAIN_EVENTS.PURCHASE_ORDER_CREATED, async (data) => {
    const { orderId, supplierId, totalAmount, tenantId } = data;
    logger.info({ orderId, supplierId, totalAmount }, '[PROCUREMENT] PO created');

    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      await prisma.dailyProcurementSummary.upsert({
        where: {
          tenantId_reportDate: { tenantId, reportDate: today },
        },
        update: {
          totalAmount: { increment: totalAmount || 0 },
          totalOrders: { increment: 1 },
        },
        create: {
          tenantId,
          reportDate: today,
          totalAmount: totalAmount || 0,
          totalOrders: 1,
        },
      });
    } catch (err) {
      logger.error({ err, orderId }, '[PROCUREMENT-LISTENER] Failed to update daily summary');
    }
  });

  // ── PROCUREMENT LISTENERS ───────────────────────────────────

  localEventBus.on(DOMAIN_EVENTS.SALE_RETURNED, async (data) => {
    const { invoiceId, tenantId, branchId, refundAmount } = data;
    logger.info({ invoiceId, refundAmount }, '[RETURN] Sale returned, updating daily summary');

    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      await prisma.dailySalesSummary.updateMany({
        where: {
          tenantId,
          branchId: branchId || null,
          salesDate: today,
        },
        data: {
          totalReturns: { increment: refundAmount || 0 },
        },
      });
    } catch (err) {
      logger.error({ err, invoiceId }, '[RETURN-LISTENER] Failed to update daily summary');
    }
  });

  localEventBus.on(DOMAIN_EVENTS.PURCHASE_ORDER_RECEIVED, async (orderId) => {
    logger.info({ orderId }, '[PROCUREMENT] PO received');

    try {
      // Update PO status
      await prisma.purchaseOrder.update({
        where: { id: orderId },
        data: { status: PURCHASE_ORDER_STATUS.RECEIVED },
      });
    } catch (err) {
      logger.error({ err, orderId }, '[PROCUREMENT-LISTENER] Failed to update PO status');
    }
  });

  // ── CLINICAL LISTENERS ──────────────────────────────────────

  localEventBus.on(DOMAIN_EVENTS.PRESCRIPTION_FULFILLED, async (data) => {
    const prescriptionId = data;
    logger.info({ prescriptionId }, '[CLINICAL] Prescription fulfilled');

    try {
      await prisma.prescription.update({
        where: { id: prescriptionId },
        data: { verificationStatus: 'FULFILLED' },
      });
    } catch (err) {
      logger.error(
        { err, prescriptionId },
        '[CLINICAL-LISTENER] Failed to update prescription status',
      );
    }
  });

  localEventBus.on(DOMAIN_EVENTS.PATIENT_ARCHIVED, async (data) => {
    const { patientId, tenantId, fullName, archivedBy } = data;
    logger.info({ patientId, fullName, archivedBy }, '[CLINICAL] Patient archived');

    try {
      await prisma.auditLog.create({
        data: {
          tenantId,
          action: 'PATIENT_ARCHIVED',
          target: `Patient: ${fullName} (${patientId})`,
          type: 'ACCESS',
        },
      });
    } catch (err) {
      logger.error({ err, patientId }, '[AUDIT-LISTENER] Failed to log patient archive');
    }
  });

  // ── SETTINGS LISTENERS ──────────────────────────────────────

  localEventBus.on(DOMAIN_EVENTS.GST_SETTINGS_UPDATED, async (data) => {
    const { tenantId, changedBy } = data;
    logger.info({ tenantId, changedBy }, '[SETTINGS] GST settings updated');
    // Invalidate billing cache, notify accounting module, etc.
  });

  localEventBus.on(DOMAIN_EVENTS.SETTINGS_UPDATED, async (data) => {
    const { tenantId, settingKey } = data;
    logger.info({ tenantId, settingKey }, '[SETTINGS] Settings updated');
  });

  // ── SECURITY LISTENERS ──────────────────────────────────────

  localEventBus.on(DOMAIN_EVENTS.USER_LOGIN, async (data) => {
    const { userId, email, ipAddress } = data;
    logger.info({ userId, email, ipAddress }, '[SECURITY] User login');
  });

  localEventBus.on(DOMAIN_EVENTS.USER_ARCHIVED, async (data) => {
    const { userId, tenantId, email, archivedBy } = data;
    logger.warn({ userId, email, archivedBy }, '[SECURITY] User archived');

    try {
      await prisma.auditLog.create({
        data: {
          tenantId,
          action: 'USER_ARCHIVED',
          target: `User: ${email} (${userId})`,
          type: 'ACCESS',
        },
      });
    } catch (err) {
      logger.error({ err, userId }, '[AUDIT-LISTENER] Failed to log user archive');
    }
  });

  logger.info('[EVENT-LISTENERS] All ERP Domain Listeners initialized');
};
