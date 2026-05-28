import prisma from '../../../config/prisma.js';
import logger from '../../../shared/utils/logger.js';
import eventBus from '../../../shared/services/eventbus.service.js';
import { emitEvent } from '../../../shared/events/erp-event-bus.js';
import { DOMAIN_EVENTS } from '../../../shared/constants/events.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * Refund Infrastructure
 * Handles reversing payments and adjusting invoice balances.
 */
class RefundService {
  /**
   * Refund a specific payment allocation.
   *
   * @param {Object} params
   * @param {string} params.tenantId
   * @param {string} params.branchId
   * @param {string} params.userId
   * @param {string} params.allocationId
   * @param {number} [params.amount] Partial refund amount. If omitted, full allocation is refunded.
   * @param {string} params.reason
   */
  async refundAllocation({ tenantId, branchId, allocationId, amount, reason }) {
    return await prisma.$transaction(async (tx) => {
      // 1. Validate Allocation
      const allocation = await tx.paymentAllocation.findFirst({
        where: { id: allocationId, tenantId },
        include: { invoice: true, payment: true },
      });

      if (!allocation) {
        throw new Error('Payment allocation not found');
      }

      const refundAmount = amount || allocation.allocatedAmount;

      if (refundAmount > allocation.allocatedAmount) {
        throw new Error('Refund amount cannot exceed allocated amount');
      }

      // 2. Create Refund Payment Record (Reversal)
      const refundPayment = await tx.payment.create({
        data: {
          transactionId: `ref_${uuidv4().replace(/-/g, '')}`,
          tenantId,
          branchId,
          amount: -refundAmount, // Negative amount for reversal
          status: 'REFUNDED',
          paymentMethod: allocation.payment.paymentMethod,
          transactionReference: `REFUND_${allocation.payment.transactionReference || allocation.payment.id}`,
          paidAt: new Date(),
          paymentProvider: allocation.payment.paymentProvider,
          refundId: allocation.payment.id, // Linking to original payment
        },
      });

      // 3. Create Negative Allocation
      const refundAllocation = await tx.paymentAllocation.create({
        data: {
          tenantId,
          paymentId: refundPayment.id,
          invoiceId: allocation.invoiceId,
          allocatedAmount: -refundAmount,
        },
      });

      // 4. Update Invoice
      const newPaidAmount = allocation.invoice.paidAmount - refundAmount;
      const newBalanceAmount = allocation.invoice.totalAmount - newPaidAmount;

      let paymentStatus = 'PARTIAL';
      if (newPaidAmount <= 0) {
        paymentStatus = 'UNPAID';
      } else if (newBalanceAmount <= 0.01) {
        paymentStatus = 'PAID';
      }

      const updatedInvoice = await tx.invoice.update({
        where: { id: allocation.invoiceId },
        data: {
          paidAmount: Math.max(0, newPaidAmount),
          balanceAmount: newBalanceAmount,
          paymentStatus: paymentStatus,
        },
      });

      // 5. Update Original Payment Status if fully refunded
      // (Optional: depending on business logic, we might just rely on allocations)

      // 6. Audit Log (via events for now)
      const result = {
        success: true,
        refundId: refundPayment.id,
        refundAllocationId: refundAllocation.id,
        invoiceId: updatedInvoice.id,
        newInvoiceStatus: updatedInvoice.paymentStatus,
        refundAmount,
      };

      await emitEvent(DOMAIN_EVENTS.REFUND_PROCESSED, {
        tenantId,
        branchId,
        invoiceId: allocation.invoiceId,
        refundAmount,
        refundedAt: new Date(),
      });

      await eventBus.publish('PAYMENT_REFUNDED', {
        tenantId,
        branchId,
        invoiceId: allocation.invoiceId,
        originalPaymentId: allocation.paymentId,
        refundAmount,
        reason,
        refundedAt: new Date(),
      });

      logger.info(
        { refundId: refundPayment.id, invoiceId: allocation.invoiceId, tenantId },
        'Payment refunded successfully',
      );

      return result;
    });
  }
}

export default new RefundService();
