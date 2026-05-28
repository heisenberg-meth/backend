import prisma from '../../../config/prisma.js';
import logger from '../../../shared/utils/logger.js';
import { emitLocalEvent } from '../../../shared/events/local-event-bus.js';
import { EVENTS } from '../../../shared/constants/events.js';

class RefundApprovalService {
  async approveRefund(returnId, approvedBy, options = {}) {
    const refund = await prisma.return.findUnique({
      where: { id: returnId },
      include: { items: true },
    });

    if (!refund) {
      throw new Error(`Refund ${returnId} not found`);
    }

    if (refund.status !== 'UNDER_REVIEW' && refund.status !== 'REQUESTED') {
      throw new Error(`Refund ${returnId} is in status ${refund.status}, cannot approve`);
    }

    const updated = await prisma.return.update({
      where: { id: returnId },
      data: {
        status: 'APPROVED',
        approvedBy,
        approvedAt: new Date(),
        notes: options.notes || refund.notes,
      },
    });

    logger.info(`[Refund Approval] Refund ${returnId} approved by ${approvedBy}`);

    emitLocalEvent(EVENTS.RETURN_APPROVED, {
      returnId,
      approvedBy,
      timestamp: new Date().toISOString(),
    });

    return updated;
  }

  async rejectRefund(returnId, rejectedBy, reason) {
    const refund = await prisma.return.findUnique({
      where: { id: returnId },
    });

    if (!refund) {
      throw new Error(`Refund ${returnId} not found`);
    }

    if (refund.status !== 'UNDER_REVIEW' && refund.status !== 'REQUESTED') {
      throw new Error(`Refund ${returnId} is in status ${refund.status}, cannot reject`);
    }

    const updated = await prisma.return.update({
      where: { id: returnId },
      data: {
        status: 'REJECTED',
        rejectionReason: reason,
        rejectedBy,
        rejectedAt: new Date(),
      },
    });

    logger.info(`[Refund Approval] Refund ${returnId} rejected by ${rejectedBy}: ${reason}`);

    emitLocalEvent(EVENTS.RETURN_REJECTED, {
      returnId,
      rejectedBy,
      reason,
      timestamp: new Date().toISOString(),
    });

    return updated;
  }

  async getPendingApprovals(tenantId) {
    return prisma.return.findMany({
      where: {
        tenantId,
        approvalRequired: true,
        status: { in: ['REQUESTED', 'UNDER_REVIEW'] },
      },
      include: {
        invoice: { select: { invoiceNumber: true } },
        patient: { select: { fullName: true } },
        items: { include: { medicine: { select: { fullName: true } } } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }
}

export default new RefundApprovalService();
