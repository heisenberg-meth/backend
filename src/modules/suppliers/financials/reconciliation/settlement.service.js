import prisma from '../../../../config/prisma.js';
import ledgerService from '../ledger/ledger.service.js';
import { DOMAIN_EVENTS } from '../../../../shared/constants/events.js';
import { emitLocalEvent } from '../../../../shared/events/local-event-bus.js';
import { emitEvent } from '../../../../shared/events/erp-event-bus.js';
import auditService from '../../../audit/service/audit.prisma.service.js';
import logger from '@/shared/utils/logger.js';

class SettlementService {
  /**
   * Record a payment and allocate it to specific invoices
   */
  async recordPayment(tenantId, userId, data) {
    const {
      supplierId,
      amount,
      paymentMethod,
      paymentReference,
      paymentDate,
      notes,
      invoiceIds = [],
    } = data;

    const result = await prisma.$transaction(async (tx) => {
      // 1. Create Payment Record
      const payment = await tx.supplierPayment.create({
        data: {
          tenantId,
          supplierId,
          amount,
          paymentMethod,
          paymentReference,
          paymentDate: new Date(paymentDate || Date.now()),
          status: 'COMPLETED',
          notes,
          createdBy: userId,
        },
      });

      // 2. Create Ledger Entry (CREDIT - we paid)
      await ledgerService.createEntry(tx, {
        tenantId,
        supplierId,
        type: 'PAYMENT',
        referenceType: 'PAYMENT',
        referenceId: payment.id,
        creditAmount: amount,
        notes: `Settlement via ${paymentMethod} (Ref: ${paymentReference})`,
      });

      // 3. Reconciliation: Allocate payment to invoices
      let remainingAmount = amount;
      const allocations = [];
      const reconciledInvoices = [];

      for (const invoiceId of invoiceIds) {
        if (remainingAmount <= 0) break;

        const invoice = await tx.purchaseInvoice.findUnique({
          where: { id: invoiceId },
        });

        if (!invoice || invoice.tenantId !== tenantId) continue;

        const currentBalance = invoice.totalAmount - invoice.paidAmount;
        if (currentBalance <= 0) continue;

        const allocatedAmount = Math.min(currentBalance, remainingAmount);
        const newPaidAmount = invoice.paidAmount + allocatedAmount;
        const newBalanceAmount = invoice.totalAmount - newPaidAmount;

        // Update Invoice
        await tx.purchaseInvoice.update({
          where: { id: invoiceId },
          data: {
            paidAmount: newPaidAmount,
            balanceAmount: newBalanceAmount,
            paymentStatus: newBalanceAmount <= 0 ? 'PAID' : 'PARTIAL',
          },
        });

        // Create Allocation Record
        const allocation = await tx.supplierPaymentAllocation.create({
          data: {
            tenantId,
            paymentId: payment.id,
            purchaseInvoiceId: invoiceId,
            amount: allocatedAmount,
          },
        });

        allocations.push(allocation);
        remainingAmount -= allocatedAmount;

        reconciledInvoices.push({
          invoiceId,
          paymentId: payment.id,
          amount: allocatedAmount,
        });
      }

      // 4. Audit Log
      await auditService.log({
        tenantId,
        userId,
        action: 'SUPPLIER_PAYMENT_RECORDED',
        target: `Payment of ${amount} to Supplier ${supplierId}`,
        type: 'FINANCIAL',
      });

      return { payment, allocations, unallocatedAmount: remainingAmount, reconciledInvoices };
    });

    // Publish events AFTER transaction commits
    try {
      for (const recon of result.reconciledInvoices) {
        emitLocalEvent(DOMAIN_EVENTS.SUPPLIER_INVOICE_RECEIVED, recon);
      }

      emitLocalEvent(DOMAIN_EVENTS.SUPPLIER_PAYMENT_MADE, {
        paymentId: result.payment.id,
        supplierId,
        tenantId,
      });
      await emitEvent(DOMAIN_EVENTS.SUPPLIER_PAYMENT_MADE, {
        paymentId: result.payment.id,
        tenantId,
      });
    } catch (eventError) {
      logger.info(eventError);
    }

    return result;
  }

  /**
   * Reverse a payment and rollback its allocations
   */
  async reversePayment(tenantId, paymentId, userId) {
    return prisma.$transaction(async (tx) => {
      const payment = await tx.supplierPayment.findUnique({
        where: { id: paymentId },
        include: { allocations: true },
      });

      if (!payment || payment.tenantId !== tenantId) throw new Error('Payment not found');
      if (payment.status === 'REVERSED') throw new Error('Payment already reversed');

      // 1. Update Payment Status
      await tx.supplierPayment.update({
        where: { id: paymentId },
        data: { status: 'REVERSED' },
      });

      // 2. Create Reversal Ledger Entry (DEBIT - we effectively "owe" it back until corrected)
      await ledgerService.createEntry(tx, {
        tenantId,
        supplierId: payment.supplierId,
        type: 'REVERSAL',
        referenceType: 'PAYMENT',
        referenceId: paymentId,
        debitAmount: payment.amount,
        notes: `Reversal of payment ${payment.paymentReference}`,
      });

      // 3. Rollback Invoice Allocations
      for (const allocation of payment.allocations) {
        await tx.purchaseInvoice.update({
          where: { id: allocation.purchaseInvoiceId },
          data: {
            paidAmount: { decrement: allocation.amount },
            balanceAmount: { increment: allocation.amount },
            paymentStatus: 'PARTIAL', // Re-evaluating would be safer, but partial is a safe bet
          },
        });
      }

      // 4. Audit Log
      await auditService.log({
        tenantId,
        userId,
        action: 'SUPPLIER_PAYMENT_REVERSED',
        target: `Reversal of payment ${paymentId}`,
        type: 'FINANCIAL',
      });

      emitLocalEvent(DOMAIN_EVENTS.SUPPLIER_PAYMENT_REVERSED, { paymentId, tenantId });

      return { success: true };
    });
  }
}

export default new SettlementService();
