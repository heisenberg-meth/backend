import supplierReturnService from '../service/supplier-return.service.js';
import creditNotePdfService from '../service/credit-note-pdf.service.js';

class SupplierReturnController {
  async getExpiredGroupedBySupplier(request, reply) {
    try {
      const data = await supplierReturnService.getExpiredGroupedBySupplier(request.tenantId);
      return reply.send({ success: true, data });
    } catch (error) {
      request.log.error(
        { err: error, endpoint: 'supplier-return-expired-grouped' },
        'Supplier return error',
      );
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
          return reply
            .code(400)
            .send({ success: false, message: 'Batch ID is required for each return item' });
        }
      }
      const returnRecord = await supplierReturnService.createReturn(
        request.tenantId,
        request.body,
        request.user.id,
      );
      return reply.code(201).send({ success: true, data: returnRecord });
    } catch (error) {
      request.log.error(
        { err: error, endpoint: 'supplier-return-create' },
        'Supplier return error',
      );
      return reply.code(500).send({ success: false, message: error.message });
    }
  }

  async listReturns(request, reply) {
    try {
      const result = await supplierReturnService.listReturns(request.tenantId, request.query);
      const mappedReturns = result.returns.map((ret) => {
        const hasItems = ret.items && ret.items.length > 0;
        const normalizedItems = hasItems
          ? ret.items
          : ret.batchId
            ? [
                {
                  medicine: ret.medicine,
                  batch: ret.batch,
                  quantity: ret.quantity,
                  purchasePrice: ret.returnAmount,
                  reason: ret.reason,
                },
              ]
            : [];

        return {
          ...ret,
          items: normalizedItems,
          refundAmount: ret.returnAmount,
          value: ret.returnAmount,
          originalInvoiceId: ret.purchaseInvoiceId,
        };
      });
      return reply.send({
        success: true,
        data: mappedReturns,
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
      if (!returnRecord) {
        return reply.code(404).send({ success: false, message: 'Return not found' });
      }
      const hasItems = returnRecord.items && returnRecord.items.length > 0;
      const normalizedItems = hasItems
        ? returnRecord.items
        : returnRecord.batchId
          ? [
              {
                medicine: returnRecord.medicine,
                batch: returnRecord.batch,
                quantity: returnRecord.quantity,
                purchasePrice: returnRecord.returnAmount,
                reason: returnRecord.reason,
              },
            ]
          : [];

      const mappedReturn = {
        ...returnRecord,
        items: normalizedItems,
        refundAmount: returnRecord.returnAmount,
        value: returnRecord.returnAmount,
        originalInvoiceId: returnRecord.purchaseInvoiceId,
      };
      return reply.send({ success: true, data: mappedReturn });
    } catch (error) {
      request.log.error(
        { err: error, endpoint: 'supplier-return-detail' },
        'Supplier return error',
      );
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
      request.log.error(
        { err: error, endpoint: 'supplier-return-update-status' },
        'Supplier return error',
      );
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
      request.log.error(
        { err: error, endpoint: 'supplier-return-credit-note' },
        'Supplier return error',
      );
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
      request.log.error(
        { err: error, endpoint: 'supplier-return-list-credit-notes' },
        'Supplier return error',
      );
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
      request.log.error(
        { err: error, endpoint: 'supplier-return-inward' },
        'Supplier return error',
      );
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
      request.log.error(
        { err: error, endpoint: 'supplier-return-transactions' },
        'Supplier return error',
      );
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
      request.log.error(
        { err: error, endpoint: 'supplier-return-ledger' },
        'Supplier return error',
      );
      return reply.code(500).send({ success: false, message: error.message });
    }
  }

  async updateDispatchStatus(request, reply) {
    try {
      const { dispatchStatus } = request.body;
      if (!dispatchStatus) {
        return reply.code(400).send({ success: false, message: 'dispatchStatus is required' });
      }
      const updated = await supplierReturnService.updateDispatchStatus(
        request.params.id,
        request.tenantId,
        dispatchStatus,
      );
      return reply.send({ success: true, data: updated });
    } catch (error) {
      request.log.error(
        { err: error, endpoint: 'supplier-return-dispatch-status' },
        'Supplier return error',
      );
      return reply.code(500).send({ success: false, message: error.message });
    }
  }

  async getExpiredInventorySummary(request, reply) {
    try {
      const summary = await supplierReturnService.getExpiredInventorySummary(request.tenantId);
      return reply.send({ success: true, data: summary });
    } catch (error) {
      request.log.error(
        { err: error, endpoint: 'supplier-return-expired-summary' },
        'Supplier return error',
      );
      return reply.code(500).send({ success: false, message: error.message });
    }
  }

  async getDashboardMetrics(request, reply) {
    try {
      const metrics = await supplierReturnService.getDashboardMetrics(request.tenantId);
      return reply.send({ success: true, data: metrics });
    } catch (error) {
      request.log.error(
        { err: error, endpoint: 'supplier-return-dashboard-metrics' },
        'Supplier return error',
      );
      return reply.code(500).send({ success: false, message: error.message });
    }
  }

  async generateCreditNotePdf(request, reply) {
    try {
      const pdfUrl = await creditNotePdfService.generateCreditNotePdf(
        request.params.id,
        request.tenantId,
      );
      return reply.send({ success: true, data: { pdfUrl } });
    } catch (error) {
      request.log.error({ err: error, endpoint: 'credit-note-pdf' }, 'Credit note PDF error');
      return reply.code(500).send({ success: false, message: error.message });
    }
  }

  async downloadCreditNotePdf(request, reply) {
    try {
      const buffer = await creditNotePdfService.generateBuffer(request.params.id, request.tenantId);
      reply.header('Content-Type', 'application/pdf');
      reply.header(
        'Content-Disposition',
        `inline; filename="credit-note-${request.params.id}.pdf"`,
      );
      return reply.send(buffer);
    } catch (error) {
      request.log.error(
        { err: error, endpoint: 'credit-note-pdf-download' },
        'Credit note PDF download error',
      );
      return reply.code(500).send({ success: false, message: error.message });
    }
  }
}

export default new SupplierReturnController();
