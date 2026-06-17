import prisma from '../../../config/prisma.js';
import returnRepository from '../repositories/return.repository.js';
import { emitLocalEvent } from '../../../shared/events/local-event-bus.js';
import { emitEvent } from '../../../shared/events/erp-event-bus.js';
import { DOMAIN_EVENTS } from '../../../shared/constants/events.js';
import logger from '../../../shared/utils/logger.js';
import unifiedRefundOrchestrator from '../../refunds/services/unified-refund.orchestrator.js';

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

    const { refundMethod } = refundDetails || {};

    const result = await unifiedRefundOrchestrator.processRefund({
      tenantId,
      userId,
      invoiceId: returnRecord.invoiceId,
      returnId: returnId,
      refundAmount: returnRecord.totalReturnAmount,
      refundMethod: refundMethod || 'CASH',
      reason: returnRecord.returnReason,
    });

    emitLocalEvent(DOMAIN_EVENTS.REFUND_COMPLETED, {
      returnId,
      invoiceId: returnRecord.invoiceId,
      tenantId,
      refundAmount: returnRecord.totalReturnAmount,
      refundMethod: refundMethod || 'CASH',
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

    return result.returnRecord;
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
