import pointsService from '../points/points.service.js';
import redemptionService from '../redemptions/redemption.service.js';
import creditService from '../credits/credit.service.js';
import riskEngine from '../risk/risk.service.js';
import fraudService from '../fraud/fraud.service.js';
import logger from '../../../shared/utils/logger.js';

class LoyaltyFastifyController {
  /**
   * GET /api/loyalty/:id
   */
  async getLoyaltyProfile(request, reply) {
    try {
      const { id } = request.params;
      const tenantId = request.tenantId || request.user?.tenantId;

      const [loyaltyAccount, creditAccount, risk] = await Promise.all([
        pointsService.getAccount(id, tenantId),
        creditService.getAccount(id, tenantId),
        riskEngine.assessCreditRisk(id, tenantId),
      ]);

      return reply.send({
        success: true,
        data: {
          patientId: id,
          availablePoints: loyaltyAccount.availablePoints,
          lifetimePoints: loyaltyAccount.lifetimePoints,
          loyaltyTier: loyaltyAccount.loyaltyTier,
          creditLimit: creditAccount.creditLimit,
          outstandingBalance: creditAccount.outstandingBalance,
          accountStatus: creditAccount.accountStatus,
          riskStatus: risk,
        },
      });
    } catch (err) {
      logger.error({ err }, 'Error fetching loyalty profile');
      return reply.code(500).send({ success: false, message: err.message });
    }
  }

  /**
   * POST /api/loyalty/:id/redeem
   */
  async redeemPoints(request, reply) {
    try {
      const { id } = request.params;
      const { points, referenceId } = request.body;
      const tenantId = request.tenantId || request.user?.tenantId;

      const abuse = await fraudService.detectLoyaltyAbuse(id, tenantId);
      if (abuse.suspicious) {
        return reply.code(403).send({ success: false, message: 'Suspicious activity detected', flags: abuse.flags });
      }

      if (!points || points <= 0) {
        throw new Error('Invalid points amount');
      }

      const result = await redemptionService.redeemPoints(tenantId, id, points, referenceId);
      return reply.send({ success: true, data: result });
    } catch (err) {
      return reply.code(400).send({ success: false, message: err.message });
    }
  }

  /**
   * POST /api/loyalty/:id/credit
   */
  async addCredit(request, reply) {
    try {
      const { id } = request.params;
      const { amount, notes, referenceId, dueDate } = request.body;
      const tenantId = request.tenantId || request.user?.tenantId;

      const risk = await riskEngine.assessCreditRisk(id, tenantId);
      if (risk.blocked) {
        return reply.code(403).send({ success: false, message: 'Credit account is blocked', reason: risk.reason });
      }

      const result = await creditService.issueCredit(tenantId, id, amount, referenceId, notes, dueDate);
      return reply.send({ success: true, data: result });
    } catch (err) {
      return reply.code(400).send({ success: false, message: err.message });
    }
  }

  /**
   * POST /api/loyalty/:id/credit-payment
   */
  async makePayment(request, reply) {
    try {
      const { id } = request.params;
      const { amount, notes } = request.body;
      const tenantId = request.tenantId || request.user?.tenantId;

      const result = await creditService.recordPayment(tenantId, id, amount, notes);
      return reply.send({ success: true, data: result });
    } catch (err) {
      return reply.code(400).send({ success: false, message: err.message });
    }
  }

  /**
   * GET /api/loyalty/:id/loyalty-transactions
   */
  async getLoyaltyHistory(request, reply) {
    try {
      const { id } = request.params;
      const history = await pointsService.getHistory(id);
      return reply.send({ success: true, data: history });
    } catch (err) {
      return reply.code(500).send({ success: false, message: err.message });
    }
  }

  /**
   * GET /api/loyalty/:id/credit-ledger
   */
  async getCreditLedger(request, reply) {
    try {
      const { id } = request.params;
      const history = await creditService.getLedger(id);
      return reply.send({ success: true, data: history });
    } catch (err) {
      return reply.code(500).send({ success: false, message: err.message });
    }
  }

  /**
   * GET /api/loyalty/analytics/loyalty
   */
  async getLoyaltyAnalytics(request, reply) {
    try {
      const tenantId = request.tenantId || request.user?.tenantId;
      const analytics = await pointsService.getAnalytics(tenantId);
      return reply.send({ success: true, data: analytics });
    } catch (err) {
      return reply.code(500).send({ success: false, message: err.message });
    }
  }

  /**
   * GET /api/loyalty/analytics/credit
   */
  async getCreditAnalytics(request, reply) {
    try {
      const tenantId = request.tenantId || request.user?.tenantId;
      const analytics = await creditService.getAnalytics(tenantId);
      return reply.send({ success: true, data: analytics });
    } catch (err) {
      return reply.code(500).send({ success: false, message: err.message });
    }
  }
}

export default new LoyaltyFastifyController();
