import recommendationService from '../services/recommendation.service.js';
import { success, error } from '../../../shared/helpers/response.js';

class RecommendationFastifyController {
  async getRecommendations(request, reply) {
    try {
      const recommendations = await recommendationService.getRecommendations(request.tenantId);
      return reply.send(success(recommendations));
    } catch (err) {
      return reply.code(500).send(error(err.message, 'INTERNAL_SERVER_ERROR'));
    }
  }

  async triggerManualGeneration(request, reply) {
    try {
      const recs = await recommendationService.generateRecommendations(request.tenantId);
      return reply.send(success({ message: 'Recommendations generated', count: recs.length }));
    } catch (err) {
      return reply.code(500).send(error(err.message, 'INTERNAL_SERVER_ERROR'));
    }
  }
}

export default new RecommendationFastifyController();
