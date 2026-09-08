import globalSearchService from '../services/global-search.service.js';
import { success, error } from '../../../shared/helpers/response.js';

class GlobalSearchFastifyController {
  async search(request, reply) {
    try {
      const { q, category, limit } = request.query;
      const results = await globalSearchService.searchGlobal(request.tenantId, {
        q,
        category,
        limit,
      });

      return reply.send(
        success({
          results,
        }),
      );
    } catch (err) {
      request.log?.error?.(err, 'Global search failed');
      return reply.code(500).send(error(err.message || 'Internal server error', 'SEARCH_ERROR'));
    }
  }
}

export default new GlobalSearchFastifyController();
