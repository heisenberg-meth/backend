import expiryService from '../services/expiry.service.js';
import { success, error } from '../../../shared/helpers/response.js';

class ExpiryFastifyController {
  async getActiveAlerts(request, reply) {
    try {
      const alerts = await expiryService.getActiveAlerts(request.tenantId);
      return reply.send(success(alerts));
    } catch (err) {
      return reply.code(500).send(error(err.message, 'INTERNAL_SERVER_ERROR'));
    }
  }

  async getCriticalAlerts(request, reply) {
    try {
      const alerts = await expiryService.getCriticalAlerts(request.tenantId);
      return reply.send(success(alerts));
    } catch (err) {
      return reply.code(500).send(error(err.message, 'INTERNAL_SERVER_ERROR'));
    }
  }

  async resolveAlert(request, reply) {
    try {
      await expiryService.resolveAlert(request.params.id, request.tenantId);
      return reply.send(success({ message: 'Alert resolved' }));
    } catch (err) {
      return reply.code(500).send(error(err.message, 'INTERNAL_SERVER_ERROR'));
    }
  }

  async triggerManualScan(request, reply) {
    try {
      await expiryService.processExpiryScan();
      return reply.send(success({ message: 'Expiry scan triggered successfully' }));
    } catch (err) {
      return reply.code(500).send(error(err.message, 'INTERNAL_SERVER_ERROR'));
    }
  }
}

export default new ExpiryFastifyController();
