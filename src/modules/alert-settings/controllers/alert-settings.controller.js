import service from '../services/alert-settings.service.js';
import logger from '../../../shared/utils/logger.js';
import { alertSettingsSchema, overrideSchema } from '../validators/alert-settings.validators.js';

class AlertSettingsController {
  async getSettings(req, reply) {
    const tenantId = req.tenant.id;
    const { branchId } = req.query;
    try {
      const settings = await service.getSettings(tenantId, branchId || null);
      return reply.send({ success: true, data: settings });
    } catch (err) {
      logger.error({ err, tenantId }, 'Failed to get alert settings');
      return reply.code(500).send({ success: false, error: 'Failed to retrieve alert settings' });
    }
  }

  async updateSettings(req, reply) {
    const tenantId = req.tenant.id;
    const { branchId } = req.query;
    const updatedBy = req.user?.email || req.user?.id;
    try {
      const validated = alertSettingsSchema.parse(req.body);
      const settings = await service.updateSettings(
        tenantId,
        validated,
        updatedBy,
        branchId || null,
      );
      return reply.send({ success: true, data: settings, message: 'Alert settings updated' });
    } catch (err) {
      if (err.name === 'ZodError') {
        return reply
          .code(400)
          .send({ success: false, error: 'Validation failed', details: err.errors });
      }
      logger.error({ err, tenantId }, 'Failed to update alert settings');
      return reply
        .code(500)
        .send({ success: false, error: err.message || 'Failed to update alert settings' });
    }
  }

  async createOverride(req, reply) {
    const tenantId = req.tenant.id;
    const { settingsId } = req.params;
    try {
      const validated = overrideSchema.parse(req.body);
      const override = await service.createOverride(tenantId, settingsId, validated);
      return reply
        .code(201)
        .send({ success: true, data: override, message: 'Threshold override created' });
    } catch (err) {
      if (err.name === 'ZodError') {
        return reply
          .code(400)
          .send({ success: false, error: 'Validation failed', details: err.errors });
      }
      return reply.code(400).send({ success: false, error: err.message });
    }
  }

  async updateOverride(req, reply) {
    const tenantId = req.tenant.id;
    const { id } = req.params;
    try {
      const validated = overrideSchema.partial().parse(req.body);
      const override = await service.updateOverride(tenantId, id, validated);
      return reply.send({ success: true, data: override, message: 'Threshold override updated' });
    } catch (err) {
      if (err.name === 'ZodError') {
        return reply
          .code(400)
          .send({ success: false, error: 'Validation failed', details: err.errors });
      }
      return reply.code(400).send({ success: false, error: err.message });
    }
  }

  async getOverrides(req, reply) {
    const tenantId = req.tenant.id;
    const { settingsId } = req.params;
    try {
      const overrides = await service.getOverrides(tenantId, settingsId);
      return reply.send({ success: true, data: overrides });
    } catch (err) {
      logger.error({ err, tenantId }, 'Failed to get overrides');
      return reply.code(500).send({ success: false, error: 'Failed to retrieve overrides' });
    }
  }

  async testAlertRules(req, reply) {
    const tenantId = req.tenant.id;
    try {
      const result = await service.testAlertRules(tenantId, req.body);
      return reply.send({ success: true, data: result });
    } catch (err) {
      return reply.code(400).send({ success: false, error: err.message });
    }
  }

  async deleteOverride(req, reply) {
    const tenantId = req.tenant.id;
    const { id } = req.params;
    try {
      await service.deleteOverride(tenantId, id);
      return reply.send({ success: true, message: 'Threshold override deleted' });
    } catch {
      return reply.code(500).send({ success: false, error: 'Failed to delete override' });
    }
  }
}

export default new AlertSettingsController();
