import prisma from '../../../config/prisma.js';
import returnRepository from '../repositories/return.repository.js';
import { emitLocalEvent } from '../../../shared/events/local-event-bus.js';
import { emitEvent } from '../../../shared/events/erp-event-bus.js';
import { DOMAIN_EVENTS } from '../../../shared/constants/events.js';
import logger from '../../../shared/utils/logger.js';

class RefundEngine {
  async processRefund(returnId, tenantId, userId, refundDetails) {
    const returnRecord = await prisma.return.findUnique({
      where: { id: returnId, tenantId },
      include: {
        items: true,
        invoice: true,
      },
    });

    if (!returnRecord) {
      throw new Error('Return not found');
    }

    if (returnRecord.status !== 'APPROVED') {
      throw new Error(`Cannot process refund for return in status: ${returnRecord.status}`);
    }

    if (returnRecord.refundStatus === 'COMPLETED') {
      throw new Error('Refund already completed');
    }

    const { refundMethod, transactionId } = refundDetails;

    const result = await prisma.$transaction(async (tx) => {
      const updatedReturn = await tx.return.update({
        where: { id: returnId },
        data: {
          refundMethod,
          refundStatus: 'COMPLETED',
          refundTransactionId: transactionId || `REFUND-${Date.now()}`,
          status: 'REFUNDED',
        },
        include: {
          items: true,
          invoice: true,
        },
      });

      const invoice = await tx.invoice.findUnique({
        where: { id: returnRecord.invoiceId },
        include: {
          payments: true,
        },
      });

      const totalRefunded = await tx.return.aggregate({
        where: {
          invoiceId: returnRecord.invoiceId,
          refundStatus: 'COMPLETED',
        },
        _sum: {
          totalReturnAmount: true,
        },
      });

      const totalRefundedAmount = totalRefunded._sum.totalReturnAmount || 0;

      if (totalRefundedAmount >= invoice.totalAmount) {
        await tx.invoice.update({
          where: { id: returnRecord.invoiceId },
          data: { status: 'REFUNDED' },
        });
      } else if (totalRefundedAmount > 0) {
        await tx.invoice.update({
          where: { id: returnRecord.invoiceId },
          data: { status: 'PARTIALLY_REFUNDED' },
        });
      }

      return updatedReturn;
    });

    emitLocalEvent(DOMAIN_EVENTS.REFUND_COMPLETED, {
      returnId,
      invoiceId: returnRecord.invoiceId,
      tenantId,
      refundAmount: returnRecord.totalReturnAmount,
      refundMethod,
      timestamp: new Date().toISOString(),
    });

    await emitEvent(DOMAIN_EVENTS.REFUND_COMPLETED, {
      returnId,
      tenantId,
      refundAmount: returnRecord.totalReturnAmount,
    });

    logger.info(
      `[Refund] Processed refund for ${returnRecord.returnNumber}: ₹${returnRecord.totalReturnAmount}`,
    );

    return result;
  }

  async initiateRefund(returnId, tenantId) {
    const returnRecord = await returnRepository.findById(returnId, tenantId);

    if (!returnRecord) {
      throw new Error('Return not found');
    }

    if (returnRecord.status !== 'APPROVED') {
      throw new Error(`Cannot initiate refund for return in status: ${returnRecord.status}`);
    }

    return await returnRepository.updateStatus(returnId, { refundStatus: 'PROCESSING' }, prisma);
  }

  async markRefundFailed(returnId, tenantId, reason) {
    const returnRecord = await returnRepository.findById(returnId, tenantId);

    if (!returnRecord) {
      throw new Error('Return not found');
    }

    return await returnRepository.updateStatus(
      returnId,
      {
        refundStatus: 'FAILED',
        notes: `${returnRecord.notes}\nRefund failed: ${reason}`,
      },
      prisma,
    );
  }

  async retryRefund(returnId, tenantId, userId, refundDetails) {
    const returnRecord = await returnRepository.findById(returnId, tenantId);

    if (!returnRecord) {
      throw new Error('Return not found');
    }

    if (returnRecord.refundStatus !== 'FAILED') {
      throw new Error('Can only retry failed refunds');
    }

    return this.processRefund(returnId, tenantId, userId, refundDetails);
  }
}

export default new RefundEngine();
