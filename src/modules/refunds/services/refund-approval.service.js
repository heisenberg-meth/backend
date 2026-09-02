import prisma from '../../../config/prisma.js';
import { emitLocalEvent } from '../../../shared/events/local-event-bus.js';
import { EVENTS } from '../../../shared/constants/events.js';

class RefundApprovalService {
  async approveRefund(returnId, userId, tenantId) {
    const refund = await prisma.return.findUnique({
      where: { id: returnId },
    });

    if (!refund || (tenantId && refund.tenantId !== tenantId)) {
      throw new Error('Refund not found');
    }

    if (!['UNDER_REVIEW', 'REQUESTED', 'PENDING'].includes(refund.status)) {
      throw new Error(`cannot approve refund in status: ${refund.status}`);
    }

    const updated = await prisma.return.update({
      where: { id: returnId },
      data: {
        status: 'APPROVED',
        approvedBy: userId,
        approvedAt: new Date(),
      },
    });

    emitLocalEvent(EVENTS.REFUND_APPROVED || 'REFUND_APPROVED', {
      returnId: updated.id,
      tenantId: updated.tenantId,
      approvedBy: userId,
      timestamp: new Date().toISOString(),
    });

    return updated;
  }

  async rejectRefund(returnId, userId, tenantId, rejectionReason) {
    const refund = await prisma.return.findUnique({
      where: { id: returnId },
    });

    if (!refund || (tenantId && refund.tenantId !== tenantId)) {
      throw new Error('Refund not found');
    }

    if (!['UNDER_REVIEW', 'REQUESTED', 'PENDING'].includes(refund.status)) {
      throw new Error(`cannot reject refund in status: ${refund.status}`);
    }

    const updated = await prisma.return.update({
      where: { id: returnId },
      data: {
        status: 'REJECTED',
        rejectionReason,
      },
    });

    emitLocalEvent(EVENTS.REFUND_REJECTED || 'REFUND_REJECTED', {
      returnId: updated.id,
      tenantId: updated.tenantId,
      rejectedBy: userId,
      rejectionReason,
      timestamp: new Date().toISOString(),
    });

    return updated;
  }
}

export default new RefundApprovalService();
