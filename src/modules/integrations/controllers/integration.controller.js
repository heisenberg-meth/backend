import integrationService from '../services/integration.service.js';
import logger from '../../../shared/utils/logger.js';

class IntegrationController {
  async getSettings(request, reply) {
    try {
      const tenantId = request.tenantId;
      const branchId = request.query.branchId || request.branchId;

      const settings = await integrationService.getSettings(tenantId, branchId);
      return reply.send({ success: true, data: settings });
    } catch (error) {
      logger.error({ error, tenantId: request.tenantId }, '[INTEGRATIONS] Get settings failed');
      return reply
        .code(500)
        .send({ success: false, error: 'Failed to retrieve integration settings' });
    }
  }

  async updateSettings(request, reply) {
    try {
      const tenantId = request.tenantId;
      const branchId = request.body.branchId || request.branchId;
      const userId = request.user?.userId || request.user?.id;
      const settings = request.body.settings;

      if (!settings) {
        return reply.code(400).send({ success: false, error: 'Settings are required' });
      }

      await integrationService.updateSettings(tenantId, settings, userId, branchId);
      return reply.send({ success: true, message: 'Integration settings updated successfully' });
    } catch (error) {
      logger.error({ error, tenantId: request.tenantId }, '[INTEGRATIONS] Update settings failed');
      return reply
        .code(500)
        .send({ success: false, error: 'Failed to update integration settings' });
    }
  }

  async testProvider(request, reply) {
    try {
      const { providerType, branchId } = request.body;
      const tenantId = request.tenantId;

      if (!providerType) {
        return reply.code(400).send({ success: false, error: 'Provider type is required' });
      }

      const result = await integrationService.testProvider(
        tenantId,
        providerType,
        branchId || request.branchId,
      );
      return reply.send({ success: true, data: result });
    } catch (error) {
      logger.error({ error, tenantId: request.tenantId }, '[INTEGRATIONS] Test provider failed');
      return reply
        .code(500)
        .send({ success: false, error: error.message || 'Provider test failed' });
    }
  }

  async getHealth(request, reply) {
    try {
      const tenantId = request.tenantId;
      const health = await integrationService.checkHealth(tenantId);
      return reply.send({ success: true, data: health });
    } catch (error) {
      logger.error({ error, tenantId: request.tenantId }, '[INTEGRATIONS] Get health failed');
      return reply.code(500).send({ success: false, error: 'Failed to retrieve provider health' });
    }
  }
}

export default new IntegrationController();
