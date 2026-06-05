import prisma from '../../../config/prisma.js';
import { emitEvent } from '../../../shared/events/erp-event-bus.js';

class ProcurementService {
  async createRequest(tenantId, userId, branchId, data) {
    const request = await prisma.procurementRequest.create({
      data: {
        tenantId,
        branchId,
        requestedById: userId,
        status: 'PENDING',
        ...data,
      },
    });

    // Emit event for finance to validate budget
    await emitEvent('PROCUREMENT_REQUEST_CREATED', {
      requestId: request.id,
      tenantId,
      amount: request.totalAmount,
    });

    return request;
  }
}

export default new ProcurementService();
