import { Worker } from 'bullmq';
import { getBullRedis } from '../../../config/redis.js';
import { registerWorker } from '../../../config/queue-registry.js';
import refundApproval from '../services/refund-approval.service.js';
import refundInventory from '../services/refund-inventory.service.js';
import refundPayment from '../services/refund-payment.service.js';
import refundRepository from '../repositories/refund.repository.js';
import logger from '../../../shared/utils/logger.js';

const isTest = process.env.NODE_ENV === 'test';

const handlers = {
  'process-approval': async (data) => {
    const { returnId, action, userId, tenantId, reason } = data;
    // FIX #04: tenantId must be in the job payload — injected by the controller from request.tenantId
    if (!tenantId) {
      throw new Error(
        '[Refund Worker] tenantId missing from job data — cannot approve/reject without tenant context',
      );
    }
    if (action === 'approve') {
      logger.info(`[Refund Worker] Approving refund ${returnId} for tenant ${tenantId}`);
      return refundApproval.approveRefund(returnId, userId, tenantId, { notes: reason });
    }
    if (action === 'reject') {
      logger.info(`[Refund Worker] Rejecting refund ${returnId} for tenant ${tenantId}`);
      return refundApproval.rejectRefund(returnId, userId, tenantId, reason);
    }
  },

  'process-payment-reversal': async (data) => {
    const { returnId, invoiceId } = data;
    logger.info(`[Refund Worker] Processing payment reversal for refund ${returnId}`);
    const payments = await refundRepository.findRefundById(returnId);
    const refundPayments = payments?.refundPayments || [];
    if (refundPayments.length > 0) {
      await refundPayment.updateInvoicePaymentState(invoiceId, returnId, refundPayments, null);
    }
  },

  'restore-inventory': async (data) => {
    const { tenantId, returnId } = data;
    logger.info(`[Refund Worker] Restoring inventory for refund ${returnId}`);
    const refund = await refundRepository.findRefundById(returnId);
    if (refund?.items) {
      await refundInventory.restoreStock(tenantId, returnId, refund.items, null);
    }
  },
};

export const refundApprovalWorker = isTest
  ? null
  : registerWorker(
      new Worker(
        'viyan-medassist-refund-approval',
        async (job) => {
          const handler = handlers[job.name];
          if (handler) {
            logger.info(`[Refund Worker] Started job ${job.id} (${job.name})`);
            await handler(job.data);
            logger.info(`[Refund Worker] Finished job ${job.id} (${job.name})`);
          }
        },
        { connection: getBullRedis(), concurrency: 5 },
      ),
    );

export const refundPaymentWorker = isTest
  ? null
  : registerWorker(
      new Worker(
        'viyan-medassist-refund-payment',
        async (job) => {
          const handler = handlers[job.name];
          if (handler) {
            await handler(job.data);
          }
        },
        { connection: getBullRedis(), concurrency: 3 },
      ),
    );

if (refundApprovalWorker) {
  refundApprovalWorker.on('failed', (job, err) => {
    logger.error(`[Refund Worker] Job ${job?.id} failed: ${err.message}`);
  });
}
