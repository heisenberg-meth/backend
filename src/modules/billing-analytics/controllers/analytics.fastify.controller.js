import dashboardService from '../services/dashboard.service.js';
import cashRegisterService from '../reconciliation/cash-register.service.js';
import logger from '../../../shared/utils/logger.js';

class AnalyticsFastifyController {
  /**
   * GET /api/billing/daily-summary
   */
  async getDailySummary(request, reply) {
    const { tenantId, branchId } = request.user;
    const { date } = request.query;

    try {
      const summary = await dashboardService.getDailySummary(tenantId, branchId, date);
      return reply.send({ success: true, data: summary });
    } catch (error) {
      logger.error({ error, tenantId }, 'Failed to fetch daily summary');
      return reply.code(500).send({ success: false, message: 'Internal server error' });
    }
  }

  /**
   * GET /api/billing/payment-breakdown
   */
  async getPaymentBreakdown(request, reply) {
    const { tenantId, branchId } = request.user;
    const { date } = request.query;

    try {
      const breakdown = await dashboardService.getPaymentBreakdown(tenantId, branchId, date);
      return reply.send({ success: true, data: breakdown });
    } catch (error) {
      logger.error({ error, tenantId }, 'Failed to fetch payment breakdown');
      return reply.code(500).send({ success: false, message: 'Internal server error' });
    }
  }

  /**
   * GET /api/billing/today-sales
   */
  async getTodaySales(request, reply) {
    const { tenantId, branchId } = request.user;
    const { limit } = request.query;

    try {
      const sales = await dashboardService.getTodaySales(tenantId, branchId, limit);
      return reply.send({ success: true, data: sales });
    } catch (error) {
      logger.error({ error, tenantId }, 'Failed to fetch today sales');
      return reply.code(500).send({ success: false, message: 'Internal server error' });
    }
  }

  /**
   * GET /api/billing/cash-register (Get Active)
   * POST /api/billing/cash-register (Open)
   */
  async handleCashRegister(request, reply) {
    const { tenantId, branchId, userId: cashierId } = request.user;
    // Fallback if userId is not in user object
    const finalCashierId = cashierId || request.user.id;

    if (request.method === 'GET') {
      const session = await cashRegisterService.getActiveSession(tenantId, finalCashierId);
      return reply.send({ success: true, data: session });
    }

    if (request.method === 'POST') {
      const { openingCash, notes } = request.body;
      try {
        const session = await cashRegisterService.openSession(
          tenantId,
          branchId,
          finalCashierId,
          openingCash,
          notes,
        );
        return reply.code(201).send({ success: true, data: session });
      } catch (error) {
        return reply.code(400).send({ success: false, message: error.message });
      }
    }
  }

  /**
   * POST /api/billing/cash-register/close
   */
  async closeCashRegister(request, reply) {
    const { tenantId } = request.user;
    const { sessionId, closingCash, notes } = request.body;

    try {
      const session = await cashRegisterService.closeSession(
        tenantId,
        sessionId,
        closingCash,
        notes,
      );
      return reply.send({ success: true, data: session });
    } catch (error) {
      logger.error({ error, sessionId }, 'Failed to close cash register session');
      return reply.code(400).send({ success: false, message: error.message });
    }
  }

  /**
   * GET /api/billing/cash-register/history
   */
  async getRegisterHistory(request, reply) {
    const { tenantId, branchId } = request.user;
    const { from, to } = request.query;

    try {
      const history = await cashRegisterService.getSessionHistory(tenantId, branchId, from, to);
      return reply.send({ success: true, data: history });
    } catch (error) {
      logger.error({ error, tenantId }, 'Failed to fetch register history');
      return reply.code(500).send({ success: false, message: 'Internal server error' });
    }
  }
}

export default new AnalyticsFastifyController();
