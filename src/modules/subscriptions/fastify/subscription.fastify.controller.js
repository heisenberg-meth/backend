import subscriptionService from '../subscription.service.js';

class SubscriptionFastifyController {
  async getStatus(request, reply) {
    try {
      // req.tenantId is populated by requireTenant middleware in fastify
      const status = await subscriptionService.getSubscriptionStatus(request.tenantId);
      return status;
    } catch (error) {
      request.log.error(error);
      return reply.code(500).send({ success: false, message: 'Failed to fetch subscription status' });
    }
  }

  async createSubscription(request, reply) {
    try {
      const { planId, billingCycle } = request.body;
      const sub = await subscriptionService.createSubscription(request.tenantId, planId, billingCycle);
      return reply.code(201).send(sub);
    } catch (error) {
      if (error.message === 'Invalid plan') {
        return reply.code(400).send({ success: false, error: error.message });
      }
      request.log.error(error);
      return reply.code(500).send({ success: false, message: 'Failed to create subscription' });
    }
  }

  async cancelSubscription(request, reply) {
    try {
      await subscriptionService.cancelSubscription(request.tenantId);
      return { success: true, message: 'Subscription cancelled successfully.' };
    } catch (error) {
      request.log.error(error);
      return reply.code(500).send({ success: false, message: 'Failed to cancel subscription' });
    }
  }

  async activateSubscription(request, reply) {
    try {
      const status = await subscriptionService.activateSubscription(request.tenantId);
      return { success: true, data: status };
    } catch (error) {
      request.log.error(error);
      return reply.code(500).send({ success: false, message: 'Failed to activate subscription' });
    }
  }
}

export default new SubscriptionFastifyController();
