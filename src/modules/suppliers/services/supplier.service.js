import redisClient from '../../../config/redis.js';
import prisma from '../../../config/prisma.js';
import { PURCHASE_ORDER_STATUS } from '../../../shared/constants/purchase-order-status.js';
import supplierRepository from '../repositories/supplier.repository.js';
import supplierAnalyticsService from '../analytics/supplier-analytics.service.js';
import auditService from '../../audit/service/audit.prisma.service.js';
import logger from '../../../shared/utils/logger.js';
import { DOMAIN_EVENTS } from '../../../shared/constants/events.js';
import { emitLocalEvent } from '../../../shared/events/local-event-bus.js';
import { emitEvent } from '../../../shared/events/erp-event-bus.js';

const CACHE_TTL = 300;

class SupplierService {
  _cacheKey(tenantId) {
    return `suppliers:list:${tenantId}`;
  }

  async _getCached(key) {
    try {
      const cached = await redisClient.get(key);
      return cached ? JSON.parse(cached) : null;
    } catch (err) {
      logger.error({ err }, 'Redis cache read error');
      return null;
    }
  }

  async _setCache(key, data) {
    try {
      await redisClient.set(key, JSON.stringify(data), 'EX', CACHE_TTL);
    } catch (err) {
      logger.error({ err }, 'Redis cache write error');
    }
  }

  async _invalidateCache(tenantId) {
    try {
      await redisClient.del(this._cacheKey(tenantId));
    } catch (err) {
      logger.error({ err }, 'Redis cache invalidation error');
    }
  }

  async getSuppliers(tenantId, query) {
    const cacheKey = this._cacheKey(tenantId);
    const { search, status, page, limit } = query;

    if (!search && !status && page === 1) {
      const cached = await this._getCached(cacheKey);
      if (cached) return cached;
    }

    const result = await supplierRepository.findAll(tenantId, { search, status, page, limit });

    if (!search && !status && page === 1) {
      await this._setCache(cacheKey, result);
    }

    return result;
  }

  async getSupplierById(id, tenantId) {
    const supplier = await supplierRepository.findById(id, tenantId);
    if (!supplier) throw new Error('Supplier not found');

    const ledgerSummary = await prisma.supplierLedger.groupBy({
      by: ['supplierId'],
      where: { supplierId: id, tenantId },
      _sum: { debitAmount: true, creditAmount: true },
    });

    const totalDebit = ledgerSummary[0]?._sum.debitAmount || 0;
    const totalCredit = ledgerSummary[0]?._sum.creditAmount || 0;

    return {
      ...supplier,
      ledgerSummary: {
        totalDebit,
        totalCredit,
        balance: totalCredit - totalDebit,
      },
    };
  }

  async createSupplier(data, tenantId, userId) {
    if (data.gstNumber) {
      const existing = await supplierRepository.findByGst(data.gstNumber, tenantId);
      if (existing) throw new Error('Supplier with this GST number already exists');
    }

    const sanitizedData = {
      ...data,

      contactPerson: data.contactPerson || data.contact || '',
      gstNumber: data.gstNumber || data.gst || '',
      leadTimeDays: data.leadTimeDays || Number(data.leadTime || 7),
      paymentTermsDays: data.paymentTermsDays || (data.paymentTerms === 'COD' ? 0 : 30),
    };
    const supplierCode = await supplierRepository.getNextSupplierCode(tenantId);
    const supplier = await supplierRepository.create({ ...sanitizedData, tenantId, supplierCode });

    await this._invalidateCache(tenantId);

    await auditService.log({
      tenantId,
      userId,
      action: 'CREATE_SUPPLIER',
      target: supplier.name,
      type: 'INVENTORY',
    });

    // Emit domain events
    emitLocalEvent(DOMAIN_EVENTS.SUPPLIER_CREATED, { supplierId: supplier.id, tenantId, userId });
    await emitEvent(DOMAIN_EVENTS.SUPPLIER_CREATED, { supplierId: supplier.id, tenantId, userId });

    return supplier;
  }

  async updateSupplier(id, tenantId, data, userId) {
    const existing = await supplierRepository.findById(id, tenantId);
    if (!existing) throw new Error('Supplier not found');

    if (data.gstNumber && data.gstNumber !== existing.gstNumber) {
      const duplicateGst = await supplierRepository.findByGst(data.gstNumber, tenantId);
      if (duplicateGst) throw new Error('Supplier with this GST number already exists');
    }

    const { ...sanitizedData } = data;
    const supplier = await supplierRepository.update(id, tenantId, sanitizedData);

    await this._invalidateCache(tenantId);

    await auditService.log({
      tenantId,
      userId,
      action: 'UPDATE_SUPPLIER',
      target: supplier.name,
      type: 'INVENTORY',
    });

    // Emit domain events
    const changedFields = Object.keys(data);
    emitLocalEvent(DOMAIN_EVENTS.SUPPLIER_UPDATED, {
      supplierId: id,
      tenantId,
      userId,
      changedFields,
    });
    await emitEvent(DOMAIN_EVENTS.SUPPLIER_UPDATED, {
      supplierId: id,
      tenantId,
      userId,
      changedFields,
    });

    if (data.status && data.status !== existing.status) {
      emitLocalEvent(DOMAIN_EVENTS.SUPPLIER_STATUS_CHANGED, {
        supplierId: id,
        tenantId,
        userId,
        from: existing.status,
        to: data.status,
      });
      await emitEvent(DOMAIN_EVENTS.SUPPLIER_STATUS_CHANGED, {
        supplierId: id,
        tenantId,
        userId,
        from: existing.status,
        to: data.status,
      });
    }

    return supplier;
  }

  async deleteSupplier(id, tenantId, userId) {
    const supplier = await supplierRepository.findById(id, tenantId);
    if (!supplier) throw new Error('Supplier not found');

    // Check for pending purchase orders before archival
    const pendingPOs = await prisma.purchaseOrder.count({
      where: {
        supplierId: id,
        tenantId,
        deletedAt: null,
        status: {
          in: [
            PURCHASE_ORDER_STATUS.DRAFT,
            PURCHASE_ORDER_STATUS.PENDING_APPROVAL,
            PURCHASE_ORDER_STATUS.APPROVED,
            PURCHASE_ORDER_STATUS.SENT,
          ],
        },
      },
    });
    if (pendingPOs > 0) {
      throw new Error(
        `Cannot archive supplier: ${pendingPOs} pending purchase order(s) exist. Complete or cancel them first.`,
      );
    }

    await supplierRepository.softDelete(id, tenantId);

    await prisma.supplier.update({
      where: { id, tenantId },
      data: { status: 'ARCHIVED' },
    });

    await this._invalidateCache(tenantId);

    await auditService.log({
      tenantId,
      userId,
      action: 'ARCHIVE_SUPPLIER',
      target: supplier.name,
      type: 'INVENTORY',
    });

    emitLocalEvent(DOMAIN_EVENTS.SUPPLIER_ARCHIVED, { supplierId: id, tenantId, userId });
    await emitEvent(DOMAIN_EVENTS.SUPPLIER_ARCHIVED, { supplierId: id, tenantId, userId });
  }

  async getStats(tenantId) {
    return supplierRepository.getStats(tenantId);
  }

  async getPerformance(id, tenantId) {
    return supplierAnalyticsService.getSupplierPerformance(id, tenantId);
  }

  async getPurchaseHistory(id, tenantId, query) {
    return supplierAnalyticsService.getPurchaseHistory(id, tenantId, query);
  }

  async getPendingPayments(id, tenantId) {
    return supplierAnalyticsService.getPendingPayments(id, tenantId);
  }

  async getDrugs(id, tenantId) {
    return supplierAnalyticsService.getSupplierDrugs(id, tenantId);
  }

  async compareSuppliers(ids, tenantId) {
    return supplierAnalyticsService.compareSuppliers(ids, tenantId);
  }

  async getRankings(tenantId) {
    return supplierAnalyticsService.getSupplierRankings(tenantId);
  }

  async getDeliveryHistory(id, tenantId) {
    return supplierAnalyticsService.getDeliveryHistory(id, tenantId);
  }

  async getSpendAnalysis(id, tenantId) {
    return supplierAnalyticsService.getSpendAnalysis(id, tenantId);
  }

  async getRiskAlerts(id, tenantId) {
    return supplierAnalyticsService.getRiskAlerts(id, tenantId);
  }

  async getReconciliation(id, tenantId) {
    return supplierAnalyticsService.getReconciliation(id, tenantId);
  }

  async getLedger(id, tenantId, query) {
    const supplier = await supplierRepository.findById(id, tenantId);
    if (!supplier) throw new Error('Supplier not found');

    return supplierRepository.getLedger(id, tenantId, query);
  }

  async recordPayment(id, tenantId, userId, data) {
    const supplier = await supplierRepository.findById(id, tenantId);
    if (!supplier) throw new Error('Supplier not found');

    return prisma.$transaction(async (tx) => {
      const payment = await tx.supplierPayment.create({
        data: {
          tenantId,
          supplierId: id,
          paymentReference: data.paymentReference || '',
          paymentMethod: data.paymentMethod,
          amount: data.amount,
          paymentDate: new Date(data.paymentDate),
          notes: data.notes || '',
          createdBy: userId,
        },
      });

      const lastBalance = await this._getLastLedgerBalance(id, tenantId, tx);
      const balanceAfter = Number(lastBalance) - Number(data.amount);

      await tx.supplierLedger.create({
        data: {
          tenantId,
          supplierId: id,
          type: 'PAYMENT',
          referenceType: 'PAYMENT',
          referenceId: payment.id,
          debitAmount: 0,
          creditAmount: data.amount,
          balanceAfter,
          notes: `Payment via ${data.paymentMethod}${data.paymentReference ? ` (Ref: ${data.paymentReference})` : ''}`,
        },
      });

      await tx.supplier.update({
        where: { id, tenantId },
        data: { lastPurchaseDate: new Date() },
      });

      await this._invalidateCache(tenantId);

      // Emit Events
      emitLocalEvent(DOMAIN_EVENTS.SUPPLIER_PAYMENT_MADE, {
        supplierId: id,
        amount: data.amount,
        tenantId,
      });
      emitLocalEvent(DOMAIN_EVENTS.SUPPLIER_LEDGER_UPDATED, { supplierId: id, tenantId });

      await emitEvent(DOMAIN_EVENTS.SUPPLIER_PAYMENT_MADE, {
        supplierId: id,
        amount: data.amount,
        tenantId,
      });
      await emitEvent(DOMAIN_EVENTS.SUPPLIER_LEDGER_UPDATED, { supplierId: id, tenantId });

      return payment;
    });
  }

  async _getLastLedgerBalance(supplierId, tenantId, tx) {
    const lastEntry = await tx.supplierLedger.findFirst({
      where: { supplierId, tenantId },
      orderBy: { createdAt: 'desc' },
      select: { balanceAfter: true },
    });
    return parseFloat(String(lastEntry?.balanceAfter || 0));
  }

  async getPurchaseOrders(id, tenantId, query) {
    const supplier = await supplierRepository.findById(id, tenantId);
    if (!supplier) throw new Error('Supplier not found');

    return supplierRepository.getPurchaseOrders(id, tenantId, query);
  }

  async createPurchaseOrder(id, tenantId, userId, data) {
    const supplier = await supplierRepository.findById(id, tenantId);
    if (!supplier) throw new Error('Supplier not found');

    if (supplier.status === 'BLACKLISTED') {
      throw new Error('Cannot create purchase order: supplier is BLACKLISTED');
    }
    if (supplier.status === 'BLOCKED') {
      throw new Error('Cannot create purchase order: supplier is BLOCKED');
    }
    if (supplier.status === 'INACTIVE') {
      throw new Error('Cannot create purchase order: supplier is INACTIVE');
    }

    const orderNumber = await supplierRepository.getNextPONumber(tenantId);

    let subtotal = 0;
    let gstAmount = 0;

    const items = await Promise.all(
      data.items.map(async (item) => {
        const medicine = await prisma.medicine.findFirst({
          where: { id: item.medicineId, tenantId, deletedAt: null },
          select: { name: true },
        });

        const itemTotal = item.quantity * item.unitPrice;
        const itemGst = itemTotal * (item.gstPercentage / 100);
        subtotal += itemTotal;
        gstAmount += itemGst;

        return {
          medicineId: item.medicineId,
          medicineName: medicine?.name || '',
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          gstPercentage: item.gstPercentage || 0,
          totalAmount: itemTotal + itemGst,
          currentStock: 0,
          reorderQty: item.quantity,
        };
      }),
    );

    const totalAmount = subtotal + gstAmount;

    const purchaseOrder = await supplierRepository.createPurchaseOrder({
      tenantId,
      supplierId: id,
      userId,
      orderNumber,
      branchId: data.branchId,
      subtotal,
      gstAmount,
      totalAmount,
      expectedDeliveryDate: data.expectedDeliveryDate ? new Date(data.expectedDeliveryDate) : null,
      notes: data.notes || '',
      items,
    });

    await auditService.log({
      tenantId,
      userId,
      action: 'CREATE_PURCHASE_ORDER',
      target: `PO-${orderNumber}`,
      type: 'INVENTORY',
    });

    return purchaseOrder;
  }
}

export default new SupplierService();
