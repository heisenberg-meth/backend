import supplierReturnService from '../service/supplier-return.service.js';

class SupplierReturnController {
  async getExpiredGroupedBySupplier(request, reply) {
    try {
      const data = await supplierReturnService.getExpiredGroupedBySupplier(request.tenantId);
      return reply.send({ success: true, data });
    } catch (error) {
      request.log.error({ err: error, endpoint: 'supplier-return-expired-grouped' }, 'Supplier return error');
      return reply.code(500).send({ success: false, message: error.message });
    }
  }

  async createReturn(request, reply) {
    try {
      const { items } = request.body;
      if (!Array.isArray(items) || items.length === 0) {
        return reply.code(400).send({ success: false, message: 'Return items required' });
      }
      for (const item of items) {
        if (!item.batchId) {
          return reply.code(400).send({ success: false, message: 'Batch ID is required for each return item' });
        }
      }
      const returnRecord = await supplierReturnService.createReturn(
        request.tenantId,
        request.body,
        request.user.id,
      );
      return reply.code(201).send({ success: true, data: returnRecord });
    } catch (error) {
      request.log.error({ err: error, endpoint: 'supplier-return-create' }, 'Supplier return error');
      return reply.code(500).send({ success: false, message: error.message });
    }
  }

  async listReturns(request, reply) {
    try {
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
    } catch (error) {
      request.log.error({ err: error, endpoint: 'supplier-return-list' }, 'Supplier return error');
      return reply.code(500).send({ success: false, message: error.message });
    }
  }

  async getReturnDetail(request, reply) {
    try {
      const returnRecord = await supplierReturnService.getReturnDetail(
        request.params.id,
        request.tenantId,
      );
      return reply.send({ success: true, data: returnRecord });
    } catch (error) {
      request.log.error({ err: error, endpoint: 'supplier-return-detail' }, 'Supplier return error');
      return reply.code(500).send({ success: false, message: error.message });
    }
  }

  async updateReturnStatus(request, reply) {
    try {
      const updated = await supplierReturnService.updateStatus(
        request.params.id,
        request.tenantId,
        request.body.status,
        request.user.id,
      );
      return reply.send({ success: true, data: updated });
    } catch (error) {
      request.log.error({ err: error, endpoint: 'supplier-return-update-status' }, 'Supplier return error');
      return reply.code(500).send({ success: false, message: error.message });
    }
  }

  async generateCreditNote(request, reply) {
    try {
      const creditNote = await supplierReturnService.generateCreditNote(
        request.params.id,
        request.body,
      );
      return reply.code(201).send({ success: true, data: creditNote });
    } catch (error) {
      request.log.error({ err: error, endpoint: 'supplier-return-credit-note' }, 'Supplier return error');
      return reply.code(500).send({ success: false, message: error.message });
    }
  }

  async listCreditNotes(request, reply) {
    try {
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
    } catch (error) {
      request.log.error({ err: error, endpoint: 'supplier-return-list-credit-notes' }, 'Supplier return error');
      return reply.code(500).send({ success: false, message: error.message });
    }
  }

  async getSupplierInwardTransactions(request, reply) {
    try {
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
    } catch (error) {
      request.log.error({ err: error, endpoint: 'supplier-return-inward' }, 'Supplier return error');
      return reply.code(500).send({ success: false, message: error.message });
    }
  }

  async getSupplierReturnTransactions(request, reply) {
    try {
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
    } catch (error) {
      request.log.error({ err: error, endpoint: 'supplier-return-transactions' }, 'Supplier return error');
      return reply.code(500).send({ success: false, message: error.message });
    }
  }

  async getSupplierLedger(request, reply) {
    try {
      const result = await supplierReturnService.getSupplierLedger(
        request.params.supplierId,
        request.tenantId,
        request.query,
      );
      return reply.send({ success: true, ...result });
    } catch (error) {
      request.log.error({ err: error, endpoint: 'supplier-return-ledger' }, 'Supplier return error');
      return reply.code(500).send({ success: false, message: error.message });
    }
  }

  async getExpiredInventorySummary(request, reply) {
    try {
      const summary = await supplierReturnService.getExpiredInventorySummary(request.tenantId);
      return reply.send({ success: true, data: summary });
    } catch (error) {
      request.log.error({ err: error, endpoint: 'supplier-return-expired-summary' }, 'Supplier return error');
      return reply.code(500).send({ success: false, message: error.message });
    }
  }
}

export default new SupplierReturnController();
