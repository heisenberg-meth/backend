import analyticsService from './analytics.service.js';

class AnalyticsController {
  async getOverdueAnalytics(request, reply) {
    try {
      const stats = await analyticsService.getOverdueAnalytics(request.tenantId);
      reply.send({ success: true, data: stats });
    } catch (error) {
      reply.code(500).send({ success: false, message: error.message });
    }
  }

  async getLoyaltyAnalytics(request, reply) {
    try {
      const stats = await analyticsService.getLoyaltyAnalytics(request.tenantId);
      reply.send({ success: true, data: stats });
    } catch (error) {
      reply.code(500).send({ success: false, message: error.message });
    }
  }
}

export default new AnalyticsController();
