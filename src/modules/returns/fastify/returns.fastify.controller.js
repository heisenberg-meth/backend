import returnService from '../services/return.service.js';
import creditNoteService from '../services/credit-note.service.js';
// FIX #08: Import from the single canonical refund engine (billing module).
// The duplicate src/modules/returns/refund-engine/refund.engine.js is deprecated
// and should be deleted. Using one engine ensures SELECT FOR UPDATE orchestrator
// protection is always applied and eliminates the double-refund code path risk.
import refundEngine from '../../billing/refund-engine/refund.engine.js';
import inventoryReversalService from '../inventory-reversal/inventory-reversal.service.js';
import gstAdjustmentService from '../gst-adjustments/gst-adjustment.service.js';
import fraudDetectionService from '../fraud-detection/fraud-detection.service.js';
import { createReturnSchema } from '../validators/returns.validator.js';
import { ZodError } from 'zod';

class ReturnsFastifyController {
  async createReturn(request, reply) {
    try {
      // Validate request body against Zod schema
      const { body: validatedBody } = createReturnSchema.parse({ body: request.body });

      const result = await returnService.createReturn(
        request.tenantId,
        request.user.id,
        validatedBody,
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
    } catch (error) {
      if (error instanceof ZodError) {
        const firstIssue = error.issues?.[0];
        return reply.code(400).send({
          success: false,
          error: {
            message: firstIssue?.message || 'Validation failed',
            code: 'VALIDATION_ERROR',
            details: error.issues,
          },
        });
      }
      request.log.error({ err: error }, '[RETURN ERROR]');
      return reply.code(400).send({
        success: false,
        error: {
          message: error.message,
          code: 'RETURN_CREATION_FAILED',
        },
      });
    }
  }

  async getReturns(request, reply) {
    try {
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
    } catch (error) {
      request.log.error({ err: error, endpoint: 'returns-list' }, 'Returns error');
      return reply.code(500).send({ success: false, message: error.message });
    }
  }

  async getReturnStats(request, reply) {
    try {
      const stats = await returnService.getReturnStats(request.tenantId);
      return reply.send({ success: true, data: stats });
    } catch (error) {
      request.log.error({ err: error, endpoint: 'returns-stats' }, 'Returns error');
      return reply.code(500).send({ success: false, message: error.message });
    }
  }

  async getFraudStats(request, reply) {
    try {
      const stats = await fraudDetectionService.getFraudStats(request.tenantId);
      return reply.send({ success: true, data: stats });
    } catch (error) {
      request.log.error({ err: error, endpoint: 'returns-fraud-stats' }, 'Returns error');
      return reply.code(500).send({ success: false, message: error.message });
    }
  }

  async getGstImpact(request, reply) {
    try {
      const { year, month } = request.query;
      const impact = await gstAdjustmentService.getGstImpact(
        request.tenantId,
        parseInt(year, 10),
        parseInt(month, 10),
      );
      return reply.send({ success: true, data: impact });
    } catch (error) {
      request.log.error({ err: error, endpoint: 'returns-gst-impact' }, 'Returns error');
      return reply.code(500).send({ success: false, message: error.message });
    }
  }

  async getReturnById(request, reply) {
    try {
      const returnRecord = await returnService.getReturn(request.params.id, request.tenantId);
      return reply.send({
        success: true,
        data: { return: returnRecord, creditNotes: returnRecord.creditNotes || [] },
      });
    } catch (error) {
      request.log.error({ err: error, endpoint: 'returns-by-id' }, 'Returns error');
      return reply.code(500).send({ success: false, message: error.message });
    }
  }

  async approveReturn(request, reply) {
    try {
      const updated = await returnService.approveReturn(
        request.params.id,
        request.tenantId,
        request.user.id,
        request.body.notes,
      );
      return reply.send({ success: true, data: updated, message: 'Return approved successfully' });
    } catch (error) {
      request.log.error({ err: error, endpoint: 'returns-approve' }, 'Returns error');
      return reply.code(500).send({ success: false, message: error.message });
    }
  }

  async rejectReturn(request, reply) {
    try {
      const updated = await returnService.rejectReturn(
        request.params.id,
        request.tenantId,
        request.user.id,
        request.body.reason,
      );
      return reply.send({ success: true, data: updated, message: 'Return rejected' });
    } catch (error) {
      request.log.error({ err: error, endpoint: 'returns-reject' }, 'Returns error');
      return reply.code(500).send({ success: false, message: error.message });
    }
  }

  async generateCreditNote(request, reply) {
    try {
      const creditNote = await creditNoteService.generateCreditNote(
        request.params.id,
        request.tenantId,
        request.user.id,
        request.body.notes,
      );
      return reply
        .code(201)
        .send({ success: true, data: creditNote, message: 'Credit note generated successfully' });
    } catch (error) {
      request.log.error(
        {
          event: 'CREDIT_NOTE_GENERATION_FAILURE',
          error: error.message,
          stack: error.stack,
          returnId: request.params.id,
          payload: request.body,
        },
        'Credit note generation failed',
      );
      return reply.code(500).send({ success: false, message: error.message });
    }
  }

  async processRefund(request, reply) {
    try {
      const result = await refundEngine.processRefund(
        request.params.id,
        request.tenantId,
        request.user.id,
        { ...request.body, sessionId: request.sessionId },
      );
      return reply.send({ success: true, data: result, message: 'Refund processed successfully' });
    } catch (error) {
      request.log.error({ err: error, endpoint: 'returns-process-refund' }, 'Returns error');
      return reply.code(500).send({ success: false, message: error.message });
    }
  }

  async retryRefund(request, reply) {
    try {
      const result = await refundEngine.retryRefund(
        request.params.id,
        request.tenantId,
        request.user.id,
        request.body,
      );
      return reply.send({ success: true, data: result, message: 'Refund retried successfully' });
    } catch (error) {
      request.log.error({ err: error, endpoint: 'returns-retry-refund' }, 'Returns error');
      return reply.code(500).send({ success: false, message: error.message });
    }
  }

  async processDisposition(request, reply) {
    try {
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
    } catch (error) {
      request.log.error({ err: error, endpoint: 'returns-disposition' }, 'Returns error');
      return reply.code(500).send({ success: false, message: error.message });
    }
  }
}

export default new ReturnsFastifyController();
