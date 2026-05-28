import billingService from '../services/billing.service.js';
import invoiceActionService from '../services/invoice-action.service.js';

class BillingFastifyController {
  async getInvoices(request, reply) {
    try {
      const result = await billingService.getInvoices(request.tenantId, request.query);
      return {
        success: true,
        data: result.data,
        pagination: result.pagination,
      };
    } catch (error) {
      return reply.code(500).send({ success: false, message: error.message });
    }
  }

  async checkout(request, reply) {
    try {
      if (!request.branchId) {
        throw new Error("User branchId missing");
      }
      
      const payload = {
        ...request.body,
        branchId: request.branchId
      };
      
      const invoice = await billingService.checkout(request.tenantId, payload, request.user.id);
      return reply.code(201).send({ success: true, data: invoice });
    } catch (error) {
      return reply.code(400).send({ success: false, message: error.message });
    }
  }

  async createDraft(request, reply) {
    try {
      if (!request.branchId) {
        throw new Error("User branchId missing");
      }
      
      const payload = {
        ...request.body,
        branchId: request.branchId
      };
      
      const invoice = await billingService.createDraft(request.tenantId, payload, request.user.id);
      return reply.code(201).send({ success: true, data: invoice });
    } catch (error) {
      return reply.code(400).send({ success: false, message: error.message });
    }
  }

  async getInvoiceById(request, reply) {
    try {
      const invoice = await billingService.getInvoiceById(request.params.id, request.tenantId);
      return { success: true, data: invoice };
    } catch (error) {
      return reply.code(404).send({ success: false, message: error.message });
    }
  }

  async cancelInvoice(request, reply) {
    try {
      const { reason } = request.body;
      const result = await invoiceActionService.cancel(request.params.id, request.tenantId, request.user.id, reason);
      return { success: true, data: result };
    } catch (error) {
      return reply.code(400).send({ success: false, message: error.message });
    }
  }

  async generatePdf(request, reply) {
    try {
      const pdfUrl = await invoiceActionService.generatePdf(request.params.id, request.tenantId);
      return { success: true, data: { pdfUrl } };
    } catch (error) {
      return reply.code(400).send({ success: false, message: error.message });
    }
  }

  async processRefund(request, reply) {
    try {
      const { id } = request.params;
      const { items, reason, refundAmount } = request.body;
      const result = await billingService.processRefund(
        request.tenantId,
        request.user.id,
        { invoiceId: id, items, reason, refundAmount }
      );
      return reply.send({ success: true, data: result });
    } catch (error) {
      return reply.code(400).send({ success: false, message: error.message });
    }
  }

  async scanItem(request, reply) {
    try {
      const { barcode } = request.params;
      const medicine = await billingService.scanItem(request.tenantId, barcode);
      return { success: true, data: medicine };
    } catch (error) {
      return reply.code(404).send({ success: false, message: error.message });
    }
  }
}

export default new BillingFastifyController();
