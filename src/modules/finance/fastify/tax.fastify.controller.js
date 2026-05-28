import gstService from '../services/gst.service.js';
import reconciliationService from '../services/reconciliation.service.js';

class TaxFastifyController {
  async getGstSummary(request, reply) {
    const history = await gstService.getGstHistory(request.tenantId);
    return reply.send(history);
  }

  async generateGstSummary(request, reply) {
    const { month } = request.body;
    const summary = await gstService.generateMonthlySummary(request.tenantId, month);
    return reply.send(summary);
  }

  async getProfitLoss(request, reply) {
    const { from, to } = request.query;
    if (!from || !to) return reply.code(400).send({ message: 'from and to dates are required' });
    const summary = await reconciliationService.getProfitLossSummary(request.tenantId, from, to);
    return reply.send(summary);
  }

  async reconcileSales(request, reply) {
    const { from, to } = request.query;
    const result = await reconciliationService.reconcileSalesInvoices(request.tenantId, from, to);
    return reply.send(result);
  }
}

export default new TaxFastifyController();
