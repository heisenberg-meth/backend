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

class InvoiceEngine {
  /**
   * Helper to ensure a value is a finite number
   */
  _safeNumber(value) {
    const num = Number(value);
    return Number.isFinite(num) ? num : 0;
  }

  /**
   * Create an invoice in DRAFT state. No inventory is deducted yet.
   */
  async createDraft(tenantId, userId, data, tx = null) {
    const {
      items,
      patientId,
      branchId,
      notes,
      discountAmount = 0,
      discountPercentage = 0,
      patientName,
      patientPhone,
    } = data;

    if (!branchId) {
      throw new Error('branchId is required for invoice creation');
    }

    const execute = async (t) => {
      const invoiceNumber = await this._generateInvoiceNumber(tenantId, t);

      const branchProfile = await t.storeProfile.findFirst({
        where: { tenantId, branchId },
        select: { gstin: true },
      });
      const sourceGst = branchProfile?.gstin || '';

      let targetGst = '';
      let defaultPatientName = null;
      let defaultPatientPhone = null;
      if (patientId) {
        const patient = await t.patient.findUnique({
          where: { id: patientId },
          select: { gstNumber: true, fullName: true, phone: true },
        });
        targetGst = patient?.gstNumber || '';
        defaultPatientName = patient?.fullName || null;
        defaultPatientPhone = patient?.phone || null;
      }

      const totals = await this._calculateTotals(
        tenantId,
        branchId,
        patientId,
        items,
        discountAmount,
        t,
        discountPercentage,
      );

      const invoice = await t.invoice.create({
        data: {
          tenantId,
          branchId,
          invoiceNumber,
          patientId,
          patientName: patientName || defaultPatientName || 'Walk-in Customer',
          patientPhone: patientPhone || defaultPatientPhone || null,
          subtotal: this._safeNumber(totals.subtotal),
          discountAmount: this._safeNumber(discountAmount || totals.discountAmount),
          discountPercentage: this._safeNumber(discountPercentage),
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

      for (const item of items) {
        const unitPrice = this._safeNumber(item.unitPrice);
        const quantity = this._safeNumber(item.quantity);
        const gstPercentage = this._safeNumber(item.gstPercentage);
        const itemSubtotal = unitPrice * quantity;

        let resolvedBatchId = item.batchId;

        if (!resolvedBatchId) {
          const availableBatch = await t.inventoryBatch.findFirst({
            where: {
              tenantId,
              branchId: branchId,
              medicineId: item.medicineId,
              availableQuantity: { gt: 0 },
              deletedAt: null,
              expiryDate: { gt: new Date() },
              status: 'ACTIVE',
            },
            orderBy: { expiryDate: 'asc' },
          });

          if (!availableBatch) {
            throw new Error(
              `Cannot create draft: No available active batches found for medicine ${item.medicineId}`,
            );
          }
          resolvedBatchId = availableBatch.id;
        } else {
          const batchCount = await t.inventoryBatch.count({ where: { id: resolvedBatchId } });
          if (batchCount === 0) {
            throw new Error(`Cannot create draft: Batch ${resolvedBatchId} does not exist`);
          }
        }

        const gstResult = gstService.calculateGst(
          itemSubtotal,
          gstPercentage,
          sourceGst,
          targetGst,
        );

        await t.invoiceItem.create({
          data: {
            invoiceId: invoice.id,
            medicineId: item.medicineId,
            batchId: resolvedBatchId,
            quantity,
            unitPrice,
            gstPercentage,
            cgst: this._safeNumber(gstResult.cgst),
            sgst: this._safeNumber(gstResult.sgst),
            igst: this._safeNumber(gstResult.igst),
            totalPrice: this._safeNumber(itemSubtotal + gstResult.amount),
          },
        });
      }

      return invoice;
    };

    return tx ? execute(tx) : prisma.$transaction(execute);
  }

  async finalize(invoiceId, tenantId, userId, tx = null) {
    const execute = async (t) => {
      const invoice = await t.invoice.findFirst({
        where: { id: invoiceId, tenantId, status: 'DRAFT' },
        include: { items: true },
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
          throw new Error(
            `Batch validation failed: ${missingIds.length} batch(es) not found within tenant scope. ` +
              `IDs: ${missingIds.join(', ')}`,
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
          paymentStatus: invoice.paymentStatus === 'PAID' ? 'PAID' : 'PENDING',
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

      return updated;
    };

    const result = tx ? await execute(tx) : await prisma.$transaction(execute);

    await emitEvent(DOMAIN_EVENTS.INVOICE_GENERATED, {
      invoiceId: result.id,
      tenantId: result.tenantId,
      branchId: result.branchId,
    });

    return result;
  }

  /**
   * Record payment for an invoice. Transitions to PAID if fully covered.
   */
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
    return prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.findFirst({
        where: { id: invoiceId, tenantId },
        include: { items: true, payments: true },
      });

      if (!invoice) throw new Error('Invoice not found');
      if (invoice.status === 'CANCELLED') throw new Error('Invoice already cancelled');
      if (invoice.status === 'REFUNDED') throw new Error('Cannot cancel refunded invoice');

      if (['FINALIZED', 'PAID', 'PARTIALLY_REFUNDED'].includes(invoice.status)) {
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

      const updated = await tx.invoice.update({
        where: { id: invoiceId },
        data: { status: 'CANCELLED', notes: `Cancelled: ${reason}` },
      });

      await this._audit(invoiceId, 'CANCELLED', userId, tx, reason);

      return updated;
    });
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
    let totalGst = 0;
    let totalCgst = 0;
    let totalSgst = 0;
    let totalIgst = 0;

    for (const item of items) {
      const price = this._safeNumber(item.unitPrice);
      const qty = this._safeNumber(item.quantity);
      const itemSubtotal = price * qty;

      subtotal += itemSubtotal;

      const gstResult = gstService.calculateGst(
        itemSubtotal,
        this._safeNumber(item.gstPercentage),
        sourceGst,
        targetGst,
      );

      totalGst += this._safeNumber(gstResult.amount);
      totalCgst += this._safeNumber(gstResult.cgst);
      totalSgst += this._safeNumber(gstResult.sgst);
      totalIgst += this._safeNumber(gstResult.igst);
    }

    let finalDiscountAmount = this._safeNumber(discountAmount);
    if (this._safeNumber(discountPercentage) > 0 && finalDiscountAmount === 0) {
      finalDiscountAmount = subtotal * (this._safeNumber(discountPercentage) / 100);
    }
    const grandTotal = subtotal + totalGst - finalDiscountAmount;

    return {
      subtotal,
      totalGst,
      totalCgst,
      totalSgst,
      totalIgst,
      discountAmount: finalDiscountAmount,
      totalAmount: grandTotal,
    };
  }

  async _processItemDeduction(tenantId, invoice, item, userId, tx, batchMap = new Map()) {
    let batchesToUse = [];

    if (item.batchId) {
      const lockedBatches = await tx.$queryRaw`
        SELECT * FROM "InventoryBatch" 
        WHERE id = ${item.batchId} AND "tenantId" = ${tenantId} 
        FOR UPDATE
      `;
      const batch = lockedBatches[0];
      if (!batch || batch.availableQuantity < item.quantity) {
        throw new Error(`Insufficient stock in batch ${batch?.batchNumber || 'unknown'}`);
      }
      if (batch.status !== 'ACTIVE') {
        throw new Error(`Batch ${batch.batchNumber} is ${batch.status}. Dispensing blocked.`);
      }
      batchesToUse.push({
        id: item.batchId,
        quantity: item.quantity,
        batchNumber: batch.batchNumber,
      });
    } else {
      const availableBatches = await tx.inventoryBatch.findMany({
        where: {
          tenantId,
          branchId: invoice.branchId,
          medicineId: item.medicineId,
          availableQuantity: { gt: 0 },
          deletedAt: null,
          expiryDate: { gt: new Date() },
          status: 'ACTIVE',
        },
        orderBy: { expiryDate: 'asc' },
      });

      let remaining = item.quantity;
      for (const b of availableBatches) {
        if (remaining <= 0) break;
        const take = Math.min(b.availableQuantity, remaining);
        batchesToUse.push({ id: b.id, quantity: take, batchNumber: b.batchNumber });
        remaining -= take;
      }

      if (remaining > 0) throw new Error(`Insufficient stock for medicine ID ${item.medicineId}`);
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
