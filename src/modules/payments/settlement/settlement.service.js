import prisma from '../../../config/prisma.js';
import logger from '../../../shared/utils/logger.js';
import eventBus from '../../../shared/services/eventbus.service.js';
import { emitEvent } from '../../../shared/events/erp-event-bus.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * Payment Settlement Engine
 * Handles the logic of settling invoices with one or more payments.
 */
class SettlementService {
  /**
   * Settle an invoice with one or more payment methods.
   * Supports split payments and partial settlements.
   *
   * @param {Object} params
   * @param {string} params.tenantId
   * @param {string} params.branchId
   * @param {string} params.userId
   * @param {string} params.invoiceId
   * @param {Array} params.payments Array of { method, amount, referenceNumber }
   * @param {string} [params.idempotencyKey]
   */
  async settleInvoice({ tenantId, branchId, invoiceId, payments, idempotencyKey }) {
    // 1. Idempotency Check
    if (idempotencyKey) {
      const existingKey = await prisma.idempotencyKey.findUnique({
        where: { idempotencyKey },
      });
      if (existingKey && existingKey.responseSnapshot) {
        return existingKey.responseSnapshot;
      }
    }

    return await prisma.$transaction(async (tx) => {
      // 2. Validate Invoice
      const invoice = await tx.invoice.findFirst({
        where: { id: invoiceId, tenantId },
        include: { paymentAllocations: true },
      });

      if (!invoice) {
        throw new Error('Invoice not found');
      }

      if (invoice.status === 'CANCELLED' || invoice.status === 'VOID') {
        throw new Error(`Cannot pay a ${invoice.status} invoice`);
      }

      const totalPaying = payments.reduce((sum, p) => sum + p.amount, 0);
      const remainingBalance = invoice.totalAmount - invoice.paidAmount;

      if (totalPaying > remainingBalance + 0.01) {
        // Allowing tiny floating point margin
        throw new Error(
          `Payment amount (₹${totalPaying}) exceeds remaining balance (₹${remainingBalance})`,
        );
      }

      const settlementResults = [];

      for (const p of payments) {
        // 3. Create Payment Record
        const payment = await tx.payment.create({
          data: {
            transactionId: `pmt_${uuidv4().replace(/-/g, '')}`,
            tenantId,
            branchId,
            amount: p.amount,
            status: 'SUCCESS', // Assuming immediate success for manual/cash/confirmed UPI
            paymentMethod: p.method,
            transactionReference: p.referenceNumber,
            paidAt: new Date(),
          },
        });

        // 4. Create Allocation
        const allocation = await tx.paymentAllocation.create({
          data: {
            tenantId,
            paymentId: payment.id,
            invoiceId: invoice.id,
            allocatedAmount: p.amount,
          },
        });

        settlementResults.push({ payment, allocation });
      }

      // 5. Update Invoice Status
      const newPaidAmount = invoice.paidAmount + totalPaying;
      const newBalanceAmount = invoice.totalAmount - newPaidAmount;

      let paymentStatus = 'PARTIAL';
      if (newBalanceAmount <= 0.01) {
        paymentStatus = 'PAID';
      }

      const updatedInvoice = await tx.invoice.update({
        where: { id: invoice.id },
        data: {
          paidAmount: newPaidAmount,
          balanceAmount: Math.max(0, newBalanceAmount),
          paymentStatus: paymentStatus,
        },
      });

      // Sync with corresponding Sale record
      const sale = await tx.sale.findUnique({
        where: { invoiceId: invoice.id },
      });

      if (sale) {
        let salePaymentStatus = 'PARTIAL';
        if (newBalanceAmount <= 0.01) {
          const isCredit = payments.some((p) => p.method === 'CREDIT');
          salePaymentStatus = isCredit ? 'PENDING' : 'PAID';
        }
        const lastPaymentMethod = payments[payments.length - 1]?.method || sale.paymentMethod;
        await tx.sale.update({
          where: { id: sale.id },
          data: {
            paymentStatus: salePaymentStatus,
            paymentMethod: lastPaymentMethod,
          },
        });
      }

      // 6. Record Idempotency
      const result = {
        success: true,
        invoiceId: updatedInvoice.id,
        newStatus: updatedInvoice.paymentStatus,
        paidAmount: updatedInvoice.paidAmount,
        balanceAmount: updatedInvoice.balanceAmount,
        settlements: settlementResults,
      };

      if (idempotencyKey) {
        await tx.idempotencyKey.upsert({
          where: { idempotencyKey },
          create: {
            idempotencyKey,
            responseSnapshot: result,
          },
          update: {
            responseSnapshot: result,
          },
        });
      }

      // 7. Emit Events
      for (const p of payments) {
        await emitEvent('PAYMENT_SETTLED', {
          tenantId,
          branchId,
          invoiceId: invoice.id,
          amount: p.amount,
          paymentMethod: p.method,
          settledAt: new Date(),
        });
      }

      await eventBus.publish('PAYMENT_SETTLED', {
        tenantId,
        branchId,
        invoiceId: invoice.id,
        amount: totalPaying,
        settledAt: new Date(),
      });

      logger.info({ invoiceId: invoice.id, totalPaying, tenantId }, 'Invoice settled successfully');

      return result;
    });
  }
}

export default new SettlementService();
