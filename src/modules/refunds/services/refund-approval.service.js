import prisma from '../../../config/prisma.js';
import logger from '../../../shared/utils/logger.js';
import { emitLocalEvent } from '../../../shared/events/local-event-bus.js';
import { EVENTS } from '../../../shared/constants/events.js';

class RefundApprovalService {
  // FIX #04: All queries now include tenantId to prevent cross-tenant isolation escape.
  // tenantId MUST come from request.tenantId (set by auth middleware), never from the body.

  async approveRefund(returnId, approvedBy, tenantId, options = {}) {
    if (!tenantId) throw new Error('tenantId is required');

    const refund = await prisma.return.findUnique({
      where: { id: returnId },
      include: { items: true },
    });

    // Explicit tenant check — ensures the record belongs to this tenant
    if (!refund || refund.tenantId !== tenantId) {
      throw new Error(`Refund ${returnId} not found`);
    }

    if (refund.status !== 'UNDER_REVIEW' && refund.status !== 'REQUESTED') {
      throw new Error(`Refund ${returnId} is in status ${refund.status}, cannot approve`);
    }

    // Verify the approvedBy user belongs to the same tenant
    const approver = await prisma.user.findFirst({
      where: { id: approvedBy, tenantId, deletedAt: null },
      select: { id: true },
    });
    if (!approver) {
      throw new Error('Approving user not found in this organization');
    }

    const updated = await prisma.return.update({
      where: { id: returnId, tenantId },
      data: {
        status: 'APPROVED',
        approvedBy,
        approvedAt: new Date(),
        notes: options.notes || refund.notes,
      },
    });

    logger.info(
      `[Refund Approval] Refund ${returnId} approved by ${approvedBy} for tenant ${tenantId}`,
    );

    emitLocalEvent(EVENTS.RETURN_APPROVED, {
      returnId,
      approvedBy,
      tenantId,
      timestamp: new Date().toISOString(),
    });

    return updated;
  }

  async rejectRefund(returnId, rejectedBy, tenantId, reason) {
    if (!tenantId) throw new Error('tenantId is required');

    const refund = await prisma.return.findUnique({
      where: { id: returnId },
    });

    // Explicit tenant check — prevents cross-tenant rejection
    if (!refund || refund.tenantId !== tenantId) {
      throw new Error(`Refund ${returnId} not found`);
    }

    if (refund.status !== 'UNDER_REVIEW' && refund.status !== 'REQUESTED') {
      throw new Error(`Refund ${returnId} is in status ${refund.status}, cannot reject`);
    }

    // Verify the rejectedBy user belongs to the same tenant
    const rejecter = await prisma.user.findFirst({
      where: { id: rejectedBy, tenantId, deletedAt: null },
      select: { id: true },
    });
    if (!rejecter) {
      throw new Error('Rejecting user not found in this organization');
    }

    const updated = await prisma.return.update({
      where: { id: returnId, tenantId },
      data: {
        status: 'REJECTED',
        rejectionReason: reason,
        rejectedBy,
        rejectedAt: new Date(),
      },
    });

    logger.info(
      `[Refund Approval] Refund ${returnId} rejected by ${rejectedBy} for tenant ${tenantId}: ${reason}`,
    );

    emitLocalEvent(EVENTS.RETURN_REJECTED, {
      returnId,
      rejectedBy,
      tenantId,
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
