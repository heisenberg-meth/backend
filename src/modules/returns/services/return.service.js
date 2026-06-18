import prisma from '../../../config/prisma.js';
import returnRepository from '../repositories/return.repository.js';
import { returnStateMachine, RETURN_STATUS } from '../../../shared/constants/state-machines.js';
import { emitLocalEvent } from '../../../shared/events/local-event-bus.js';
import { emitEvent } from '../../../shared/events/erp-event-bus.js';
import { DOMAIN_EVENTS } from '../../../shared/constants/events.js';
import logger from '../../../shared/utils/logger.js';

const RETURN_WINDOW_DAYS = parseInt(process.env.RETURN_WINDOW_DAYS || '7', 10);
const APPROVAL_THRESHOLD = parseFloat(process.env.RETURN_APPROVAL_THRESHOLD || '5000');

class ReturnService {
  async createReturn(tenantId, userId, data) {
    const { invoiceId, saleId, reason, returnType, items, refundMethod, notes, branchId } = data;

    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        items: {
          include: {
            medicine: true,
            batch: true,
          },
        },
        patient: true,
        branch: true,
      },
    });

    if (!invoice) {
      throw new Error('Invoice not found');
    }

    const sale = saleId
      ? await prisma.sale.findUnique({
          where: { id: saleId },
          include: { items: true },
        })
      : null;

    if (invoice.status === 'CANCELLED' || invoice.status === 'VOID') {
      throw new Error('Cannot create return for cancelled or voided invoice');
    }

    if (!this.isWithinReturnWindow(invoice.createdAt)) {
      throw new Error(`Return window expired. Returns allowed within ${RETURN_WINDOW_DAYS} days`);
    }

    const existingReturns = await returnRepository.findByInvoiceId(invoiceId, tenantId);
    this.validateReturnQuantities(items, invoice.items, existingReturns);

    const fraudResult = await this.runFraudChecks(tenantId, userId, data);
    const approvalRequired =
      fraudResult.approvalRequired || invoice.totalAmount >= APPROVAL_THRESHOLD;

    const returnNumber = await returnRepository.generateReturnNumber(
      tenantId,
      invoice.branch?.code || 'GEN',
    );

    let totalReturnAmount = 0;
    const returnItems = items.map((item) => {
      let invoiceItem = invoice.items.find((ii) => ii.id === item.invoiceItemId);

      // If not found by ID, try to match via sale items if we have a sale
      if (!invoiceItem && sale) {
        const saleItem = sale.items.find((si) => si.id === item.invoiceItemId);
        if (saleItem) {
          invoiceItem = invoice.items.find(
            (ii) => ii.batchId === saleItem.batchId && ii.medicineId === saleItem.medicineId,
          );
        }
      }

      if (!invoiceItem) {
        throw new Error(`Invoice item not found: ${item.invoiceItemId}`);
      }

      const itemAmount = invoiceItem.unitPrice * item.quantity;
      const gstAdjustment = (invoiceItem.gstPercentage / 100) * itemAmount;
      totalReturnAmount += itemAmount;

      return {
        invoiceItemId: item.invoiceItemId,
        medicineId: invoiceItem.medicineId,
        batchId: invoiceItem.batchId,
        returnedQuantity: item.quantity,
        originalQuantity: invoiceItem.quantity,
        unitPrice: invoiceItem.unitPrice,
        gstPercentage: invoiceItem.gstPercentage,
        returnAmount: itemAmount,
        gstAdjustment,
        disposition: item.disposition || this.getDefaultDisposition(reason),
      };
    });

    const initialStatus = approvalRequired ? RETURN_STATUS.REQUESTED : RETURN_STATUS.UNDER_REVIEW;

    const returnRecord = await returnRepository.createReturn(
      {
        tenantId,
        branchId: branchId || invoice.branchId,
        returnNumber,
        invoiceId,
        saleId,
        patientId: invoice.patientId,
        returnReason: reason,
        returnType: returnType || 'CUSTOMER_RETURN',
        status: initialStatus,
        totalReturnAmount,
        refundMethod,
        approvalRequired,
        fraudScore: fraudResult.score,
        fraudFlags: fraudResult.flags,
        notes,
        createdBy: userId,
        items: {
          create: returnItems,
        },
      },
      prisma,
    );

    emitLocalEvent(DOMAIN_EVENTS.RETURN_CREATED, {
      returnId: returnRecord.id,
      invoiceId,
      tenantId,
      totalReturnAmount,
      approvalRequired,
      timestamp: new Date().toISOString(),
    });

    await emitEvent(DOMAIN_EVENTS.RETURN_CREATED, {
      returnId: returnRecord.id,
      invoiceId,
      tenantId,
    });

    if (saleId) {
      const saleToUpdate = await prisma.sale.findUnique({ where: { id: saleId } });
      if (saleToUpdate) {
        const newReturnedAmount = Number(saleToUpdate.returnedAmount || 0) + totalReturnAmount;
        const newReturnCount = (saleToUpdate.returnCount || 0) + 1;

        let newStatus = saleToUpdate.status;
        let newPaymentStatus = saleToUpdate.paymentStatus;

        if (newReturnedAmount >= Number(saleToUpdate.totalAmount)) {
          newStatus = 'REFUNDED';
          newPaymentStatus = 'REFUNDED';
        } else {
          newStatus = 'PARTIAL_RETURN';
          newPaymentStatus = 'PARTIAL';
        }

        await prisma.sale.update({
          where: { id: saleId },
          data: {
            returnedAmount: newReturnedAmount,
            returnCount: newReturnCount,
            status: newStatus,
            paymentStatus: newPaymentStatus,
          },
        });
      }
    }

    logger.info(`[Return] Created ${returnNumber} for invoice ${invoice.invoiceNumber}`);

    return {
      return: returnRecord,
      approvalRequired,
      nextAction: approvalRequired ? 'AWAITING_APPROVAL' : 'UNDER_REVIEW',
    };
  }

  async approveReturn(returnId, tenantId, userId, notes) {
    const returnRecord = await returnRepository.findById(returnId, tenantId);

    if (!returnRecord) {
      throw new Error('Return not found');
    }

    const nextStatus = returnStateMachine.transition(returnRecord.status, 'APPROVE');
    if (!nextStatus) {
      throw new Error(`Cannot approve return in status: ${returnRecord.status}`);
    }

    const updated = await returnRepository.updateStatus(
      returnId,
      {
        status: nextStatus,
        approvedBy: userId,
        approvedAt: new Date(),
        notes: notes ? `${returnRecord.notes}\nApproval: ${notes}` : returnRecord.notes,
      },
      prisma,
    );

    emitLocalEvent(DOMAIN_EVENTS.RETURN_APPROVED, {
      returnId,
      tenantId,
      approvedBy: userId,
      timestamp: new Date().toISOString(),
    });

    await emitEvent(DOMAIN_EVENTS.RETURN_APPROVED, {
      returnId,
      tenantId,
    });

    logger.info(`[Return] Approved ${returnRecord.returnNumber} by ${userId}`);

    return updated;
  }

  async rejectReturn(returnId, tenantId, userId, reason) {
    const returnRecord = await returnRepository.findById(returnId, tenantId);

    if (!returnRecord) {
      throw new Error('Return not found');
    }

    const nextStatus = returnStateMachine.transition(returnRecord.status, 'REJECT');
    if (!nextStatus) {
      throw new Error(`Cannot reject return in status: ${returnRecord.status}`);
    }

    const updated = await returnRepository.updateStatus(
      returnId,
      {
        status: nextStatus,
        rejectionReason: reason,
        rejectedBy: userId,
        rejectedAt: new Date(),
      },
      prisma,
    );

    emitLocalEvent(DOMAIN_EVENTS.RETURN_REJECTED, {
      returnId,
      tenantId,
      rejectedBy: userId,
      reason,
      timestamp: new Date().toISOString(),
    });

    logger.info(`[Return] Rejected ${returnRecord.returnNumber}: ${reason}`);

    return updated;
  }

  async getReturn(returnId, tenantId) {
    const returnRecord = await returnRepository.findById(returnId, tenantId);

    if (!returnRecord) {
      throw new Error('Return not found');
    }

    return returnRecord;
  }

  async getReturns(tenantId, options) {
    return returnRepository.findAll(tenantId, options);
  }

  async getReturnStats(tenantId) {
    return returnRepository.getReturnStats(tenantId);
  }

  isWithinReturnWindow(invoiceDate) {
    const returnDeadline = new Date(invoiceDate);
    returnDeadline.setDate(returnDeadline.getDate() + RETURN_WINDOW_DAYS);
    return new Date() <= returnDeadline;
  }

  validateReturnQuantities(requestedItems, invoiceItems, existingReturns) {
    const returnedQuantities = {};

    existingReturns.forEach((ret) => {
      ret.items.forEach((item) => {
        returnedQuantities[item.invoiceItemId] =
          (returnedQuantities[item.invoiceItemId] || 0) + item.returnedQuantity;
      });
    });

    requestedItems.forEach((item) => {
      const invoiceItem = invoiceItems.find((ii) => ii.id === item.invoiceItemId);
      if (!invoiceItem) {
        throw new Error(`Invoice item not found: ${item.invoiceItemId}`);
      }

      const alreadyReturned = returnedQuantities[item.invoiceItemId] || 0;
      const availableQuantity = invoiceItem.quantity - alreadyReturned;

      if (item.quantity > availableQuantity) {
        throw new Error(
          `Return quantity (${item.quantity}) exceeds available quantity (${availableQuantity}) for item ${invoiceItem.medicine?.name || item.invoiceItemId}`,
        );
      }

      if (item.quantity <= 0) {
        throw new Error('Return quantity must be positive');
      }
    });
  }

  getDefaultDisposition(reason) {
    switch (reason) {
      case 'DAMAGED_RETURN':
        return 'DESTROY';
      case 'EXPIRED_RETURN':
        return 'DESTROY';
      case 'BILLING_CORRECTION':
        return 'RESTOCK';
      default:
        return 'PENDING';
    }
  }

  async runFraudChecks(tenantId, userId, data) {
    const flags = [];
    let score = 0;

    const recentReturns = await prisma.return.count({
      where: {
        tenantId,
        createdBy: userId,
        createdAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
        },
      },
    });

    if (recentReturns >= 5) {
      flags.push('HIGH_RETURN_VELOCITY');
      score += 30;
    }

    if (data.items && data.items.length > 10) {
      flags.push('LARGE_RETURN_ITEMS');
      score += 20;
    }

    return {
      score,
      flags,
      approvalRequired: score >= 30,
    };
  }
}

export default new ReturnService();
