import tallyService from '../services/tally.service.js';

class TallyFastifyController {
  async exportSales(request, reply) {
    const { from, to } = request.query;
    if (!from || !to) return reply.code(400).send({ message: 'from and to dates are required' });

    const xml = await tallyService.generateSalesXml(request.tenantId, from, to);
    await tallyService.recordExport(request.tenantId, {
      exportType: 'SALES',
      exportFileUrl: 'INTERNAL_XML_GENERATED',
      fromDate: new Date(from),
      toDate: new Date(to),
    });

    return reply.header('Content-Type', 'text/xml').send(xml);
  }

  async getExportHistory(request, reply) {
    const history = await tallyService.getExportHistory(request.tenantId);
    return reply.send(history);
  }
}

export default new TallyFastifyController();
