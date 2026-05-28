import subscriptionService from '../subscription.service.js';

class SubscriptionTrialFastifyController {
  async activateTrial(request, reply) {
    try {
      const result = await subscriptionService.activateTrial(request.tenantId);
      return reply.send({ success: true, currentPeriodEnd: result.endDate });
    } catch (error) {
      if (error.message === 'Trial already used') {
        return reply.code(409).send({ success: false, error: error.message });
      }
      request.log.error(error);
      return reply.code(500).send({ success: false, message: 'Failed to activate trial' });
    }
  }
}

export default new SubscriptionTrialFastifyController();
