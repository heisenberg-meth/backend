import orchestratorService from '../services/communication-orchestrator.service.js';
import adherenceEngineService from '../services/adherence-engine.service.js';
import reminderAnalyzerService from '../services/reminder-analyzer.service.js';

class CommunicationsFastifyController {
  async sendRefillReminder(request, reply) {
    try {
      const result = await orchestratorService.sendRefillReminder(
        request.params.id, request.tenantId, { channel: request.body?.channel },
      );
      return reply.send(result);
    } catch (error) {
      return reply.code(400).send({ success: false, message: error.message });
    }
  }

  async sendPrescriptionReminder(request, reply) {
    try {
      const result = await orchestratorService.sendPrescriptionReminder(
        request.params.id,
        request.tenantId,
        { channel: request.body?.channel },
      );
      return reply.send(result);
    } catch (error) {
      return reply.code(400).send({ success: false, message: error.message });
    }
  }

  async sendInvoice(request, reply) {
    try {
      if (!request.body?.invoiceId) {
        return reply.code(400).send({ success: false, message: 'invoiceId is required' });
      }
      const result = await orchestratorService.sendInvoice(
        request.params.id, request.tenantId, {
          invoiceId: request.body.invoiceId,
          channel: request.body.channel,
        },
      );
      return reply.send(result);
    } catch (error) {
      return reply.code(400).send({ success: false, message: error.message });
    }
  }

  async getStatus(request, reply) {
    try {
      const notification = await orchestratorService.getCommunicationStatus(request.params.id);
      return reply.send({ success: true, data: notification });
    } catch (error) {
      return reply.code(404).send({ success: false, message: error.message });
    }
  }

  async getPatientCommunications(request, reply) {
    try {
      const result = await orchestratorService.getPatientCommunications(
        request.params.id, request.tenantId, request.query,
      );
      return reply.send({
        success: true, data: result.data,
        meta: { total: result.total, page: result.page, limit: result.limit },
      });
    } catch (error) {
      return reply.code(500).send({ success: false, message: error.message });
    }
  }

  async retryCommunication(request, reply) {
    try {
      const result = await orchestratorService.retryCommunication(request.params.id, request.tenantId);
      return reply.send({ success: true, data: result });
    } catch (error) {
      return reply.code(400).send({ success: false, message: error.message });
    }
  }

  async updatePreferences(request, reply) {
    try {
      const result = await orchestratorService.updatePatientPreferences(
        request.params.id, request.tenantId, request.body,
      );
      return reply.send({ success: true, data: result });
    } catch (error) {
      return reply.code(400).send({ success: false, message: error.message });
    }
  }

  async analyzeReminders(request, reply) {
    try {
      const result = await reminderAnalyzerService.analyzePatientRefills(
        request.params.id, request.tenantId,
      );
      return reply.send({ success: true, data: result });
    } catch (error) {
      return reply.code(404).send({ success: false, message: error.message });
    }
  }

  async getAdherence(request, reply) {
    try {
      const { medicineId } = request.query;
      if (!medicineId) {
        return reply.code(400).send({ success: false, message: 'medicineId query param required' });
      }
      const result = await reminderAnalyzerService.getAdherenceFormula(
        request.params.id, medicineId, request.tenantId,
      );
      return reply.send({ success: true, data: result });
    } catch (error) {
      return reply.code(500).send({ success: false, message: error.message });
    }
  }

  async scanAll(request, reply) {
    try {
      const result = await adherenceEngineService.scanRefillCandidates();
      return reply.send({ success: true, data: result });
    } catch (error) {
      return reply.code(500).send({ success: false, message: error.message });
    }
  }
}

export default new CommunicationsFastifyController();
