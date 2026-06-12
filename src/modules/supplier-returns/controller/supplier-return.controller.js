import supplierReturnService from '../service/supplier-return.service.js';
import logger from '../../../shared/utils/logger.js';

class SupplierReturnController {
  async getExpiredGroupedBySupplier(request, reply) {
    const data = await supplierReturnService.getExpiredGroupedBySupplier(request.tenantId);
    return reply.send({ success: true, data });
  }

  async createReturn(request, reply) {
    const returnRecord = await supplierReturnService.createReturn(
      request.tenantId,
      request.body,
      request.user.id,
    );
    return reply.code(201).send({ success: true, data: returnRecord });
  }

  async listReturns(request, reply) {
    const result = await supplierReturnService.listReturns(request.tenantId, request.query);
    return reply.send({
      success: true,
      data: result.returns,
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages: result.totalPages,
      },
    });
  }

  async getReturnDetail(request, reply) {
    const returnRecord = await supplierReturnService.getReturnDetail(
      request.params.id,
      request.tenantId,
    );
    return reply.send({ success: true, data: returnRecord });
  }

  async updateReturnStatus(request, reply) {
    const updated = await supplierReturnService.updateStatus(
      request.params.id,
      request.tenantId,
      request.body.status,
      request.user.id,
    );
    return reply.send({ success: true, data: updated });
  }

  async generateCreditNote(request, reply) {
    const creditNote = await supplierReturnService.generateCreditNote(
      request.params.id,
      request.body,
    );
    return reply.code(201).send({ success: true, data: creditNote });
  }

  async listCreditNotes(request, reply) {
    const result = await supplierReturnService.listCreditNotes(request.tenantId, request.query);
    return reply.send({
      success: true,
      data: result.notes,
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages: result.totalPages,
      },
    });
  }

  async getSupplierInwardTransactions(request, reply) {
    const result = await supplierReturnService.getInwardTransactions(
      request.params.supplierId,
      request.tenantId,
      request.query,
    );
    return reply.send({
      success: true,
      data: result.transactions,
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages: result.totalPages,
      },
    });
  }

  async getSupplierReturnTransactions(request, reply) {
    const result = await supplierReturnService.getReturnTransactions(
      request.params.supplierId,
      request.tenantId,
      request.query,
    );
    return reply.send({
      success: true,
      data: result.returns,
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages: result.totalPages,
      },
    });
  }

  async getSupplierLedger(request, reply) {
    const result = await supplierReturnService.getSupplierLedger(
      request.params.supplierId,
      request.tenantId,
      request.query,
    );
    return reply.send({ success: true, ...result });
  }

  async getExpiredInventorySummary(request, reply) {
    const summary = await supplierReturnService.getExpiredInventorySummary(request.tenantId);
    return reply.send({ success: true, data: summary });
  }
}

export default new SupplierReturnController();
