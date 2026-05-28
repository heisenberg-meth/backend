import creditService from './credit.service.js';

class CreditController {
  async getCreditAccount(request, reply) {
    try {
      const { id } = request.params;
      const account = await creditService.getCreditAccount(id, request.tenantId);
      reply.send({ success: true, data: account });
    } catch (error) {
      reply.code(500).send({ success: false, message: error.message });
    }
  }

  async addCreditTransaction(request, reply) {
    try {
      const { id } = request.params;
      const { amount, invoiceId, dueDate } = request.body;
      await creditService.addCreditTransaction(id, request.tenantId, amount, invoiceId, dueDate);
      reply.send({ success: true, message: 'Credit transaction recorded' });
    } catch (error) {
      reply.code(400).send({ success: false, message: error.message });
    }
  }

  async getLedger(request, reply) {
    try {
      const { id } = request.params;
      const ledger = await creditService.getLedger(id, request.tenantId);
      reply.send({ success: true, data: ledger });
    } catch (error) {
      reply.code(500).send({ success: false, message: error.message });
    }
  }

  async makePayment(request, reply) {
    try {
      const { id } = request.params;
      const { amount, notes } = request.body;
      await creditService.makePayment(id, request.tenantId, amount, notes);
      reply.send({ success: true, message: 'Payment recorded' });
    } catch (error) {
      reply.code(400).send({ success: false, message: error.message });
    }
  }
}

export default new CreditController();
