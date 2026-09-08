import { Decimal } from '@prisma/client/runtime/library';
import prisma from '../../../config/prisma.js';
import sequenceService from '../../../shared/services/sequence.service.js';
import movementService from '../../stock/service/movement.service.js';
import gstService from '../services/gst.service.js';
import { DOMAIN_EVENTS } from '../../../shared/constants/events.js';
import { emitLocalEvent } from '../../../shared/events/local-event-bus.js';
import { emitEvent } from '../../../shared/events/erp-event-bus.js';
import pointsService from '../../loyalty/points/points.service.js';
import creditService from '../../loyalty/credits/credit.service.js';
import cacheInvalidatorService from '../../inventory/service/cache-invalidator.service.js';
import logger from '../../../shared/utils/logger.js';

/**
 * Resolve the Sale paymentStatus from a payment mode string.
 * CASH / UPI / CARD → PAID  (immediate settlement)
 * CREDIT / unknown  → PENDING (on-account / deferred)
 */
function resolvePaymentStatus(paymentMode) {
  const immediate = ['CASH', 'UPI', 'CARD'];
  return immediate.includes((paymentMode || '').toUpperCase()) ? 'PAID' : 'PENDING';
}

class InvoiceEngine {
  _safeNumber(value) {
    const num = Number(value);
    return Number.isFinite(num) ? num : 0;
  }

  async createDraft(tenantId, userId, data, tx = null) {
    const {
      items,
      patientId,
      branchId,
      notes,
      discountAmount = 0,
      discountPercentage = 0,
      discountType,
      patientName,
      patientPhone,
    } = data;

    if (!branchId) {
      throw new Error('branchId is required for invoice creation');
    }

    const normalizedItems = (items || []).map((item) => ({
      medicineId: item.medicineId,
      batchId: item.batchId,
      quantity: this._safeNumber(item.quantity ?? item.qty),
      unitPrice: this._safeNumber(item.unitPrice ?? item.price),
      gstPercentage: this._safeNumber(item.gstPercentage ?? item.gst),
    }));

    const execute = async (t) => {
      const invoiceNumber = await this._generateInvoiceNumber(tenantId, t);

      let defaultPatientName = null;
      let defaultPatientPhone = null;
      let patientData = null;
      if (patientId) {
        const patient = await t.patient.findUnique({
          where: { id: patientId },
        });
        defaultPatientName = patient?.fullName || null;
        defaultPatientPhone = patient?.phone || null;
        patientData = patient;
      }

      const totals = await this._calculateTotals(
        tenantId,
        branchId,
        patientId,
        normalizedItems,
        discountAmount,
        t,
        discountPercentage,
      );

      const resolvedDiscountType =
        discountType || (this._safeNumber(discountPercentage) > 0 ? 'PERCENTAGE' : 'FIXED');

      const invoice = await t.invoice.create({
        data: {
          tenantId,
          branchId,
          invoiceNumber,
          patientId,
          patientName: patientName || defaultPatientName || 'Walk-in Customer',
          patientPhone: patientPhone || defaultPatientPhone || null,
          customerName:
            patientData?.fullName || patientName || defaultPatientName || 'Walk-in Customer',
          customerPhone: patientData?.phone || patientPhone || defaultPatientPhone || null,
          customerAddressLine1: patientData?.addressLine1 || null,
          customerAddressLine2: patientData?.addressLine2 || null,
          customerLandmark: patientData?.landmark || null,
          customerArea: patientData?.area || null,
          customerCity: patientData?.city || null,
          customerDistrict: patientData?.district || null,
          customerState: patientData?.state || null,
          customerCountry: patientData?.country || null,
          customerPincode: patientData?.pincode || null,
          customerGST: patientData?.gstNumber || null,
          subtotal: this._safeNumber(totals.subtotal),
          discountAmount: this._safeNumber(totals.discountAmount),
          discountPercentage: this._safeNumber(discountPercentage),
          discountType: resolvedDiscountType,
          gstAmount: this._safeNumber(totals.totalGst),
          cgst: this._safeNumber(totals.totalCgst),
          sgst: this._safeNumber(totals.totalSgst),
          igst: this._safeNumber(totals.totalIgst),
          totalAmount: this._safeNumber(totals.totalAmount),
          status: 'DRAFT',
          paymentStatus: 'UNPAID',
          createdBy: userId,
          notes,
        },
      });

      // N+1 Optimization: Resolve all unknown batches in bulk
      const missingBatchItemIds = totals.processedItems
        .filter((i) => !i.batchId)
        .map((i) => i.medicineId);
      const availableBatchesByMedicine = {};

      if (missingBatchItemIds.length > 0) {
        const availableBatches = await t.inventoryBatch.findMany({
          where: {
            tenantId,
            branchId,
            medicineId: { in: missingBatchItemIds },
            availableQuantity: { gt: 0 },
            deletedAt: null,
            expiryDate: { gt: new Date() },
            status: 'ACTIVE',
          },
          orderBy: { expiryDate: 'asc' },
        });

        for (const b of availableBatches) {
          if (!availableBatchesByMedicine[b.medicineId]) {
            availableBatchesByMedicine[b.medicineId] = b;
          }
        }
      }

      // N+1 Optimization: Validate all known batches in bulk
      const knownBatchIds = totals.processedItems.filter((i) => i.batchId).map((i) => i.batchId);
      const validatedBatches = new Set();
      if (knownBatchIds.length > 0) {
        const found = await t.inventoryBatch.findMany({
          where: { id: { in: knownBatchIds } },
          select: { id: true },
        });
        found.forEach((f) => validatedBatches.add(f.id));
      }

      const invoiceItemsData = [];

      for (const item of totals.processedItems) {
        let resolvedBatchId = item.batchId;

        if (!resolvedBatchId) {
          const availableBatch = availableBatchesByMedicine[item.medicineId];
          if (!availableBatch) {
            throw new Error(
              `Cannot create draft: No available active batches found for medicine ${item.medicineId}`,
            );
          }
          resolvedBatchId = availableBatch.id;
        } else {
          if (!validatedBatches.has(resolvedBatchId)) {
            throw new Error(`Cannot create draft: Batch ${resolvedBatchId} does not exist`);
          }
        }

        invoiceItemsData.push({
          invoiceId: invoice.id,
          medicineId: item.medicineId,
          batchId: resolvedBatchId,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          gstPercentage: item.gstPercentage,
          discountPercentage: this._safeNumber(discountPercentage),
          discountAmount: item.itemDiscountAmount,
          cgst: item.cgst,
          sgst: item.sgst,
          igst: item.igst,
          totalPrice: item.totalPrice,
        });
      }

      await t.invoiceItem.createMany({ data: invoiceItemsData });

      return invoice;
    };

    return tx ? execute(tx) : prisma.$transaction(execute);
  }

  async updateDraft(invoiceId, tenantId, userId, data, tx = null) {
    const {
      items,
      patientId,
      branchId,
      notes,
      discountAmount = 0,
      discountPercentage = 0,
      discountType,
      patientName,
      patientPhone,
    } = data;

    if (!branchId) {
      throw new Error('branchId is required for invoice update');
    }

    const normalizedItems = (items || []).map((item) => ({
      medicineId: item.medicineId,
      batchId: item.batchId,
      quantity: this._safeNumber(item.quantity ?? item.qty),
      unitPrice: this._safeNumber(item.unitPrice ?? item.price),
      gstPercentage: this._safeNumber(item.gstPercentage ?? item.gst),
    }));

    const execute = async (t) => {
      const existing = await t.invoice.findFirst({
        where: { id: invoiceId, tenantId },
      });
      if (!existing) throw new Error('Invoice not found');
      if (existing.status !== 'DRAFT') throw new Error('Only DRAFT invoices can be updated');

      let defaultPatientName = null;
      let defaultPatientPhone = null;
      let patientData = null;
      if (patientId) {
        const patient = await t.patient.findUnique({
          where: { id: patientId },
        });
        defaultPatientName = patient?.fullName || null;
        defaultPatientPhone = patient?.phone || null;
        patientData = patient;
      }

      const totals = await this._calculateTotals(
        tenantId,
        branchId,
        patientId,
        normalizedItems,
        discountAmount,
        t,
        discountPercentage,
      );

      const resolvedDiscountType =
        discountType || (this._safeNumber(discountPercentage) > 0 ? 'PERCENTAGE' : 'FIXED');

      // delete existing items
      await t.invoiceItem.deleteMany({ where: { invoiceId } });

      const updatedInvoice = await t.invoice.update({
        where: { id: invoiceId },
        data: {
          patientId,
          patientName: patientName || defaultPatientName || 'Walk-in Customer',
          patientPhone: patientPhone || defaultPatientPhone || null,
          customerName:
            patientData?.fullName || patientName || defaultPatientName || 'Walk-in Customer',
          customerPhone: patientData?.phone || patientPhone || defaultPatientPhone || null,
          customerAddressLine1: patientData?.addressLine1 || null,
          customerAddressLine2: patientData?.addressLine2 || null,
          customerLandmark: patientData?.landmark || null,
          customerArea: patientData?.area || null,
          customerCity: patientData?.city || null,
          customerDistrict: patientData?.district || null,
          customerState: patientData?.state || null,
          customerCountry: patientData?.country || null,
          customerPincode: patientData?.pincode || null,
          customerGST: patientData?.gstNumber || null,
          subtotal: this._safeNumber(totals.subtotal),
          discountAmount: this._safeNumber(totals.discountAmount),
          discountPercentage: this._safeNumber(discountPercentage),
          discountType: resolvedDiscountType,
          gstAmount: this._safeNumber(totals.totalGst),
          cgst: this._safeNumber(totals.totalCgst),
          sgst: this._safeNumber(totals.totalSgst),
          igst: this._safeNumber(totals.totalIgst),
          totalAmount: this._safeNumber(totals.totalAmount),
          notes,
          updatedAt: new Date(),
        },
      });

      // N+1 Optimization: Resolve all unknown batches in bulk
      const missingBatchItemIds = totals.processedItems
        .filter((i) => !i.batchId)
        .map((i) => i.medicineId);
      const availableBatchesByMedicine = {};

      if (missingBatchItemIds.length > 0) {
        const availableBatches = await t.inventoryBatch.findMany({
          where: {
            tenantId,
            branchId,
            medicineId: { in: missingBatchItemIds },
            availableQuantity: { gt: 0 },
            deletedAt: null,
            expiryDate: { gt: new Date() },
            status: 'ACTIVE',
          },
          orderBy: { expiryDate: 'asc' },
        });

        for (const b of availableBatches) {
          if (!availableBatchesByMedicine[b.medicineId]) {
            availableBatchesByMedicine[b.medicineId] = b;
          }
        }
      }

      // N+1 Optimization: Validate all known batches in bulk
      const knownBatchIds = totals.processedItems.filter((i) => i.batchId).map((i) => i.batchId);
      const validatedBatches = new Set();
      if (knownBatchIds.length > 0) {
        const found = await t.inventoryBatch.findMany({
          where: { id: { in: knownBatchIds } },
          select: { id: true },
        });
        found.forEach((f) => validatedBatches.add(f.id));
      }

      const invoiceItemsData = [];

      for (const item of totals.processedItems) {
        let resolvedBatchId = item.batchId;

        if (!resolvedBatchId) {
          const availableBatch = availableBatchesByMedicine[item.medicineId];
          if (!availableBatch) {
            throw new Error(
              `Cannot update draft: No available active batches found for medicine ${item.medicineId}`,
            );
          }
          resolvedBatchId = availableBatch.id;
        } else {
          if (!validatedBatches.has(resolvedBatchId)) {
            throw new Error(`Cannot update draft: Batch ${resolvedBatchId} does not exist`);
          }
        }

        invoiceItemsData.push({
          invoiceId: updatedInvoice.id,
          medicineId: item.medicineId,
          batchId: resolvedBatchId,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          gstPercentage: item.gstPercentage,
          discountPercentage: this._safeNumber(discountPercentage),
          discountAmount: item.itemDiscountAmount,
          cgst: item.cgst,
          sgst: item.sgst,
          igst: item.igst,
          totalPrice: item.totalPrice,
        });
      }

      await t.invoiceItem.createMany({ data: invoiceItemsData });

      await this._audit(invoiceId, 'UPDATED', userId, t);

      return updatedInvoice;
    };

    return tx ? execute(tx) : prisma.$transaction(execute);
  }

  async finalize(invoiceId, tenantId, userId, tx = null, paymentMode = null) {
    const execute = async (t) => {
      const invoice = await t.invoice.findFirst({
        where: { id: invoiceId, tenantId, status: 'DRAFT' },
        include: { items: { include: { medicine: true } } },
      });

      if (!invoice) throw new Error('Draft invoice not found or already finalized');

      const batchIds = invoice.items.map((i) => i.batchId).filter(Boolean);
      let batchMap = new Map();
      if (batchIds.length > 0) {
        const batches = await t.inventoryBatch.findMany({
          where: { id: { in: batchIds }, tenantId, branchId: invoice.branchId },
        });
        if (batches.length !== batchIds.length) {
          const foundIds = new Set(batches.map((b) => b.id));
          const missingIds = batchIds.filter((id) => !foundIds.has(id));
          logger.warn(
            { missingIds, tenantId, branchId: invoice.branchId },
            'Some draft item batches not found in branch scope; FEFO allocation will select available active batches',
          );
        }
        batchMap = new Map(batches.map((b) => [b.id, b]));
      }

      for (const item of invoice.items) {
        await this._processItemDeduction(tenantId, invoice, item, userId, t, batchMap);
      }

      const snapshot = await t.invoice.findUnique({
        where: { id: invoiceId },
        include: { items: { include: { medicine: true, batch: true } }, patient: true },
      });

      const updated = await t.invoice.update({
        where: { id: invoiceId },
        data: {
          status: 'FINALIZED',
          updatedAt: new Date(),
          storedSnapshot: JSON.parse(JSON.stringify(snapshot)),
        },
      });

      const sale = await t.sale.create({
        data: {
          tenantId,
          branchId: invoice.branchId,
          invoiceId,
          totalItems: invoice.items.reduce((sum, i) => sum + i.quantity, 0),
          subtotal: invoice.subtotal,
          discountAmount: invoice.discountAmount,
          gstAmount: invoice.gstAmount,
          totalAmount: invoice.totalAmount,
          soldBy: userId,
          patientId: invoice.patientId,
          paymentMethod: paymentMode || null,
          paymentStatus: paymentMode ? resolvePaymentStatus(paymentMode) : 'PENDING',
          status: 'COMPLETED',
        },
      });

      for (const item of invoice.items) {
        const gstAmount = new Decimal(item.cgst || 0).plus(item.igst || 0).plus(item.sgst || 0);
        await t.saleItem.create({
          data: {
            saleId: sale.id,
            medicineId: item.medicineId,
            batchId: item.batchId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            discountAmount: item.discountAmount,
            gstAmount,
            totalAmount: item.totalPrice,
          },
        });
      }

      await t.invoice.update({
        where: { id: invoiceId },
        data: { saleId: sale.id },
      });

      if (invoice.patientId) {
        await pointsService.earnPoints(
          tenantId,
          invoice.patientId,
          invoice.totalAmount,
          invoice.id,
          t,
        );
      }

      await this._audit(invoiceId, 'FINALIZED', userId, t);

      emitLocalEvent(DOMAIN_EVENTS.INVOICE_FINALIZED, { invoiceId, tenantId });
      emitLocalEvent(DOMAIN_EVENTS.SALE_COMPLETED, {
        invoiceId,
        tenantId,
        branchId: invoice.branchId,
        total: invoice.totalAmount,
        items: invoice.items,
        patientId: invoice.patientId,
      });

      return updated;
    };

    const result = tx ? await execute(tx) : await prisma.$transaction(execute);

    await emitEvent(DOMAIN_EVENTS.INVOICE_GENERATED, {
      invoiceId: result.id,
      tenantId: result.tenantId,
      branchId: result.branchId,
    });

    const medicineIds = result.storedSnapshot?.items?.map((i) => i.medicineId) || [];
    if (medicineIds.length > 0) {
      await cacheInvalidatorService.invalidateInventoryCaches(tenantId, medicineIds);
    }

    return result;
  }

  async recordPayment(invoiceId, tenantId, userId, paymentData, tx = null) {
    const execute = async (t) => {
      const invoice = await t.invoice.findFirst({
        where: { id: invoiceId, tenantId },
      });

      if (!invoice) throw new Error('Invoice not found');
      if (invoice.status === 'CANCELLED') throw new Error('Cannot pay for cancelled invoice');

      await t.invoicePayment.create({
        data: {
          invoiceId,
          paymentMode: paymentData.paymentMode,
          amount: this._safeNumber(paymentData.amount),
          transactionReference: paymentData.transactionReference,
          paymentStatus: 'PAID',
        },
      });

      const newPaidAmount = Decimal.add(invoice.paidAmount, this._safeNumber(paymentData.amount));
      const isFullyPaid = newPaidAmount.gte(invoice.totalAmount);

      const updated = await t.invoice.update({
        where: { id: invoiceId },
        data: {
          paidAmount: newPaidAmount,
          paymentStatus: isFullyPaid ? 'PAID' : 'PARTIAL',
          status: isFullyPaid && invoice.status === 'FINALIZED' ? 'PAID' : invoice.status,
        },
      });

      // Sync with corresponding Sale record
      const sale = await t.sale.findUnique({
        where: { invoiceId },
      });

      if (sale) {
        let salePaymentStatus = 'PARTIAL';
        if (isFullyPaid) {
          salePaymentStatus = paymentData.paymentMode === 'CREDIT' ? 'PENDING' : 'PAID';
        }
        await t.sale.update({
          where: { id: sale.id },
          data: {
            paymentStatus: salePaymentStatus,
            paymentMethod: paymentData.paymentMode || sale.paymentMethod,
          },
        });
      }

      if (paymentData.paymentMode === 'CREDIT' && invoice.patientId) {
        await creditService.issueCredit(
          tenantId,
          invoice.patientId,
          this._safeNumber(paymentData.amount),
          invoice.id,
          `Credit for Invoice ${invoice.invoiceNumber}`,
          null,
          t,
        );
      }

      await this._audit(invoiceId, 'PAYMENT_RECEIVED', userId, t);

      return updated;
    };

    return tx ? execute(tx) : prisma.$transaction(execute);
  }

  async cancel(invoiceId, tenantId, userId, reason) {
    let medicineIds = [];
    const result = await prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.findFirst({
        where: { id: invoiceId, tenantId },
        include: { items: true, payments: true },
      });

      if (!invoice) throw new Error('Invoice not found');
      if (invoice.status === 'CANCELLED') throw new Error('Invoice already cancelled');
      if (invoice.status === 'REFUNDED') throw new Error('Cannot cancel refunded invoice');

      if (invoice.items && invoice.items.length > 0) {
        medicineIds = invoice.items.map((i) => i.medicineId);
      }

      if (['FINALIZED', 'PAID', 'PARTIALLY_REFUNDED'].includes(invoice.status)) {
        let recordedMovements = [];
        if (typeof tx.stockMovement?.findMany === 'function') {
          try {
            recordedMovements = await tx.stockMovement.findMany({
              where: {
                tenantId,
                referenceId: invoice.id,
                referenceType: 'INVOICE',
                movementType: 'SALE',
              },
            });
          } catch (mErr) {
            logger.warn(
              { err: mErr },
              'Failed to query stock movements on invoice cancel, falling back to items',
            );
          }
        }

        if (recordedMovements && recordedMovements.length > 0) {
          for (const m of recordedMovements) {
            if (m.batchId) {
              await movementService.recordMovement(
                tenantId,
                {
                  medicineId: m.medicineId,
                  batchId: m.batchId,
                  branchId: invoice.branchId,
                  movementType: 'RETURN',
                  quantity: Math.abs(m.quantity),
                  referenceType: 'INVOICE_CANCEL',
                  referenceId: invoice.id,
                  notes: `Restock from cancelled invoice ${invoice.invoiceNumber}. Reason: ${reason}`,
                },
                userId,
                tx,
              );
            }
          }
        } else {
          for (const item of invoice.items) {
            if (item.batchId) {
              await movementService.recordMovement(
                tenantId,
                {
                  medicineId: item.medicineId,
                  batchId: item.batchId,
                  branchId: invoice.branchId,
                  movementType: 'RETURN',
                  quantity: item.quantity,
                  referenceType: 'INVOICE_CANCEL',
                  referenceId: invoice.id,
                  notes: `Restock from cancelled invoice ${invoice.invoiceNumber}. Reason: ${reason}`,
                },
                userId,
                tx,
              );
            }
          }
        }
      }

      const updated = await tx.invoice.update({
        where: { id: invoiceId },
        data: { status: 'CANCELLED', notes: `Cancelled: ${reason}` },
      });

      await this._audit(invoiceId, 'CANCELLED', userId, tx, reason);

      emitLocalEvent(DOMAIN_EVENTS.INVOICE_CANCELLED, { invoiceId, tenantId, reason });
      emitLocalEvent(DOMAIN_EVENTS.SALE_CANCELLED, {
        invoiceId,
        tenantId,
        branchId: invoice.branchId,
        reason,
      });

      return updated;
    });

    if (medicineIds.length > 0) {
      await cacheInvalidatorService.invalidateInventoryCaches(tenantId, medicineIds);
    }
    return result;
  }

  async deleteDraft(invoiceId, tenantId, userId, tx = null) {
    const execute = async (t) => {
      const existing = await t.invoice.findFirst({
        where: { id: invoiceId, tenantId },
      });
      if (!existing) throw new Error('Invoice not found');
      if (existing.status !== 'DRAFT') throw new Error('Only DRAFT invoices can be deleted');

      // delete existing items
      await t.invoiceItem.deleteMany({ where: { invoiceId } });

      // delete draft invoice
      await t.invoice.delete({ where: { id: invoiceId } });

      return { success: true };
    };

    return tx ? execute(tx) : prisma.$transaction(execute);
  }

  async _calculateTotals(
    tenantId,
    branchId,
    patientId,
    items,
    discountAmount,
    tx,
    discountPercentage = 0,
  ) {
    let sourceGst = '';
    let targetGst = '';

    const branchProfile = await tx.storeProfile.findFirst({
      where: { tenantId, branchId },
      select: { gstin: true },
    });
    if (branchProfile?.gstin) sourceGst = branchProfile.gstin;

    if (patientId) {
      const patient = await tx.patient.findUnique({
        where: { id: patientId },
        select: { gstNumber: true },
      });
      if (patient?.gstNumber) targetGst = patient.gstNumber;
    }

    let subtotal = 0;
    for (const item of items) {
      subtotal += this._safeNumber(item.unitPrice) * this._safeNumber(item.quantity);
    }

    let finalDiscountAmount = this._safeNumber(discountAmount);
    if (this._safeNumber(discountPercentage) > 0 && finalDiscountAmount === 0) {
      finalDiscountAmount = subtotal * (this._safeNumber(discountPercentage) / 100);
    }

    if (finalDiscountAmount > subtotal) {
      finalDiscountAmount = subtotal;
    }

    const discountRatio = subtotal > 0 ? finalDiscountAmount / subtotal : 0;

    let totalGst = 0;
    let totalCgst = 0;
    let totalSgst = 0;
    let totalIgst = 0;
    const processedItems = [];

    for (const item of items) {
      const price = this._safeNumber(item.unitPrice);
      const qty = this._safeNumber(item.quantity);
      const rawItemSubtotal = price * qty;

      const itemDiscountAmount = rawItemSubtotal * discountRatio;
      const itemTaxableAmount = rawItemSubtotal - itemDiscountAmount;

      const gstResult = gstService.calculateGst(
        itemTaxableAmount,
        this._safeNumber(item.gstPercentage),
        sourceGst,
        targetGst,
      );

      const cgst = this._safeNumber(gstResult.cgst);
      const sgst = this._safeNumber(gstResult.sgst);
      const igst = this._safeNumber(gstResult.igst);
      const amount = this._safeNumber(gstResult.amount);

      totalGst += amount;
      totalCgst += cgst;
      totalSgst += sgst;
      totalIgst += igst;

      processedItems.push({
        ...item,
        itemDiscountAmount,
        itemTaxableAmount,
        cgst,
        sgst,
        igst,
        gstAmount: amount,
        totalPrice: itemTaxableAmount + amount,
      });
    }

    const grandTotal = subtotal - finalDiscountAmount + totalGst;

    return {
      subtotal,
      totalGst,
      totalCgst,
      totalSgst,
      totalIgst,
      discountAmount: finalDiscountAmount,
      totalAmount: grandTotal,
      processedItems,
    };
  }

  /**
   * Retrieve all eligible batches for a medicine following FEFO ordering.
   * Batches must be: active, not deleted, availableQuantity > 0, expiryDate > NOW().
   * Row locks are acquired (FOR UPDATE) to guarantee transactional consistency.
   */
  async _getAvailableBatches(tenantId, branchId, medicineId, tx) {
    let batches = [];

    if (typeof tx.$queryRaw === 'function') {
      try {
        const rawBatches = await tx.$queryRaw`
          SELECT ib."id", ib."batchNumber", ib."availableQuantity", ib."expiryDate"
          FROM "InventoryBatch" ib
          WHERE ib."tenantId" = ${tenantId}
            AND ib."branchId" = ${branchId}
            AND ib."medicineId" = ${medicineId}
            AND ib."availableQuantity" > 0
            AND ib."deletedAt" IS NULL
            AND ib."expiryDate" > NOW()
            AND ib."status" = 'ACTIVE'
          ORDER BY ib."expiryDate" ASC, ib."createdAt" ASC
          FOR UPDATE
        `;
        batches = Array.isArray(rawBatches) ? rawBatches : [];
      } catch (rawErr) {
        logger.warn({ err: rawErr }, 'FALLBACK_TO_FIND_MANY_FOR_AVAILABLE_BATCHES');
      }
    }

    if ((!batches || batches.length === 0) && tx.inventoryBatch?.findMany) {
      const found = await tx.inventoryBatch.findMany({
        where: {
          tenantId,
          branchId,
          medicineId,
          availableQuantity: { gt: 0 },
          deletedAt: null,
          expiryDate: { gt: new Date() },
          status: 'ACTIVE',
        },
        orderBy: [{ expiryDate: 'asc' }, { createdAt: 'asc' }],
      });
      batches = Array.isArray(found) ? found : [];
    }

    return batches.map((b) => ({
      ...b,
      availableQuantity: Number(b.availableQuantity),
    }));
  }

  /**
   * Sort eligible batches giving preference to a preferredBatchId if specified.
   * If preferredBatchId is valid and unexpired, it becomes the first batch consumed.
   * If not found (e.g. expired or out of stock), pure FEFO order is preserved.
   */
  _sortBatchesWithPreference(availableBatches, preferredBatchId) {
    if (!preferredBatchId || !Array.isArray(availableBatches)) {
      return [...(availableBatches || [])];
    }
    const batches = [...availableBatches];
    const preferredIndex = batches.findIndex((b) => b.id === preferredBatchId);
    if (preferredIndex > 0) {
      const [preferred] = batches.splice(preferredIndex, 1);
      batches.unshift(preferred);
    }
    return batches;
  }

  /**
   * Allocate requested quantity across eligible batches sequentially.
   * Throws an insufficient stock error if remaining requested quantity > 0.
   */
  _allocateAcrossBatches(batches, requestedQuantity, medicineName = 'Unknown') {
    const batchesToUse = [];
    let remaining = Number(requestedQuantity);

    for (const batch of batches) {
      if (remaining <= 0) break;
      const available = Number(batch.availableQuantity);
      if (available <= 0) continue;

      const take = Math.min(available, remaining);
      batchesToUse.push({
        id: batch.id,
        quantity: take,
        batchNumber: batch.batchNumber,
      });
      remaining -= take;
    }

    if (remaining > 0) {
      throw new Error(
        `Medicine "${medicineName}" has insufficient stock available (missing ${remaining})`,
      );
    }

    return batchesToUse;
  }

  async _processItemDeduction(tenantId, invoice, item, userId, tx) {
    const availableBatches = await this._getAvailableBatches(
      tenantId,
      invoice.branchId,
      item.medicineId,
      tx,
    );

    const orderedBatches = this._sortBatchesWithPreference(availableBatches, item.batchId);

    const medicineName =
      item.medicine?.medicineName || item.medicine?.name || item.medicineName || 'Unknown';

    let batchesToUse;
    try {
      batchesToUse = this._allocateAcrossBatches(orderedBatches, item.quantity, medicineName);
    } catch (err) {
      logger.error(
        {
          event: 'STOCK_DEDUCTION_FAILURE',
          tenantId,
          medicineId: item.medicineId,
          requested: item.quantity,
          branchId: invoice.branchId,
        },
        err.message,
      );
      throw err;
    }

    for (const bUsage of batchesToUse) {
      await movementService.recordMovement(
        tenantId,
        {
          medicineId: item.medicineId,
          batchId: bUsage.id,
          branchId: invoice.branchId,
          movementType: 'SALE',
          quantity: -bUsage.quantity,
          referenceType: 'INVOICE',
          referenceId: invoice.id,
          notes: `Sale via invoice ${invoice.invoiceNumber}`,
        },
        userId,
        tx,
      );
    }

    return batchesToUse;
  }

  async _audit(invoiceId, action, userId, tx, notes = null) {
    await tx.invoiceAuditLog.create({
      data: {
        invoiceId,
        action,
        performedBy: userId,
        notes,
      },
    });
  }

  async _generateInvoiceNumber(tenantId, tx) {
    return sequenceService.nextInvoiceNumber(tenantId, tx);
  }
}

export default new InvoiceEngine();
