import returnService from '../services/return.service.js';
import creditNoteService from '../services/credit-note.service.js';
import refundEngine from '../refund-engine/refund.engine.js';
import inventoryReversalService from '../inventory-reversal/inventory-reversal.service.js';
import gstAdjustmentService from '../gst-adjustments/gst-adjustment.service.js';
import fraudDetectionService from '../fraud-detection/fraud-detection.service.js';

class ReturnsFastifyController {
  async createReturn(request, reply) {
    const result = await returnService.createReturn(
      request.tenantId,
      request.user.id,
      request.body,
    );
    return reply.code(201).send({
      success: true,
      data: {
        return: result.return,
        approvalRequired: result.approvalRequired,
        nextAction: result.nextAction,
      },
      message: result.approvalRequired
        ? 'Return created, awaiting approval'
        : 'Return created, under review',
    });
  }

  async getReturns(request, reply) {
    const { status, reason, from, to, search, page, limit } = request.query;
    const result = await returnService.getReturns(request.tenantId, {
      status,
      reason,
      from,
      to,
      search,
      page,
      limit,
    });
    return reply.send({
      success: true,
      data: result.returns,
      pagination: result.pagination,
      message: 'Returns retrieved successfully',
    });
  }

  async getReturnStats(request, reply) {
    const stats = await returnService.getReturnStats(request.tenantId);
    return reply.send({ success: true, data: stats });
  }

  async getFraudStats(request, reply) {
    const stats = await fraudDetectionService.getFraudStats(request.tenantId);
    return reply.send({ success: true, data: stats });
  }

  async getGstImpact(request, reply) {
    const { year, month } = request.query;
    const impact = await gstAdjustmentService.getGstImpact(
      request.tenantId,
      parseInt(year, 10),
      parseInt(month, 10),
    );
    return reply.send({ success: true, data: impact });
  }

  async getReturnById(request, reply) {
    const returnRecord = await returnService.getReturn(request.params.id, request.tenantId);
    return reply.send({
      success: true,
      data: { return: returnRecord, creditNotes: returnRecord.creditNotes || [] },
    });
  }

  async approveReturn(request, reply) {
    const updated = await returnService.approveReturn(
      request.params.id,
      request.tenantId,
      request.user.id,
      request.body.notes,
    );
    return reply.send({ success: true, data: updated, message: 'Return approved successfully' });
  }

  async rejectReturn(request, reply) {
    const updated = await returnService.rejectReturn(
      request.params.id,
      request.tenantId,
      request.user.id,
      request.body.reason,
    );
    return reply.send({ success: true, data: updated, message: 'Return rejected' });
  }

  async generateCreditNote(request, reply) {
    const creditNote = await creditNoteService.generateCreditNote(
      request.params.id,
      request.tenantId,
      request.user.id,
      request.body.notes,
    );
    return reply
      .code(201)
      .send({ success: true, data: creditNote, message: 'Credit note generated successfully' });
  }

  async processRefund(request, reply) {
    const result = await refundEngine.processRefund(
      request.params.id,
      request.tenantId,
      request.user.id,
      request.body,
    );
    return reply.send({ success: true, data: result, message: 'Refund processed successfully' });
  }

  async retryRefund(request, reply) {
    const result = await refundEngine.retryRefund(
      request.params.id,
      request.tenantId,
      request.user.id,
      request.body,
    );
    return reply.send({ success: true, data: result, message: 'Refund retried successfully' });
  }

  async processDisposition(request, reply) {
    const results = await inventoryReversalService.processDisposition(
      request.params.id,
      request.tenantId,
      request.user.id,
      request.body.dispositions,
    );
    return reply.send({
      success: true,
      data: results,
      message: 'Inventory disposition processed successfully',
    });
  }
}

export default new ReturnsFastifyController();
