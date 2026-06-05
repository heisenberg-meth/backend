import patientService from '../services/patient.service.js';
import retentionService from '../services/retention.service.js';
import recommendationService from '../services/recommendation.service.js';
import communicationsService from '../../communications/services/communication-orchestrator.service.js';
import loyaltyService from '../../loyalty/loyalty/loyalty.service.js';
import prisma from '../../../config/prisma.js';

class PatientFastifyController {
  async getPatients(request, reply) {
    try {
      const { search, chronic, page, limit } = request.query;
      const result = await patientService.getCustomers(request.tenantId, {
        search,
        chronic,
        page: parseInt(page) || 1,
        limit: parseInt(limit) || 50,
      });
      return reply.send(result);
    } catch (error) {
      return reply.code(500).send({ message: error.message });
    }
  }

  async getVipPatients(request, reply) {
    try {
      const vips = await retentionService.getVipCustomers(request.tenantId);
      return reply.send(vips);
    } catch (error) {
      return reply.code(500).send({ message: error.message });
    }
  }

  async getInactivePatients(request, reply) {
    try {
      const inactives = await retentionService.getInactiveCustomers(request.tenantId);
      return reply.send(inactives);
    } catch (error) {
      return reply.code(500).send({ message: error.message });
    }
  }

  async getChronicPatients(request, reply) {
    try {
      const chronic = await retentionService.getChronicPatients(request.tenantId);
      return reply.send(chronic);
    } catch (error) {
      return reply.code(500).send({ message: error.message });
    }
  }

  async getRecommendations(request, reply) {
    try {
      const recommendations = await recommendationService.getReorderRecommendations(
        request.tenantId,
        request.params.id,
      );
      return reply.send(recommendations);
    } catch (error) {
      return reply.code(500).send({ message: error.message });
    }
  }

  async getPatientById(request, reply) {
    try {
      const patient = await patientService.getCustomerById(request.params.id, request.tenantId);
      return reply.send(patient);
    } catch (error) {
      return reply.code(404).send({ message: error.message });
    }
  }

  async createPatient(request, reply) {
    try {
      const patient = await patientService.createCustomer(
        request.tenantId,
        request.body,
        request.user?.email,
      );
      return reply.code(201).send(patient);
    } catch (error) {
      if (error.message.includes('Duplicate')) {
        return reply.code(409).send({ message: error.message });
      }
      if (
        error.message.includes('required') ||
        error.message.includes('Invalid') ||
        error.message.includes('must be')
      ) {
        return reply.code(400).send({ message: error.message });
      }
      return reply.code(400).send({ message: error.message });
    }
  }

  async updatePatient(request, reply) {
    try {
      const patient = await patientService.updateCustomer(
        request.params.id,
        request.tenantId,
        request.body,
        request.user?.email,
      );
      return reply.send(patient);
    } catch (error) {
      if (error.message.includes('already in use')) {
        return reply.code(409).send({ message: error.message });
      }
      if (
        error.message.includes('required') ||
        error.message.includes('Invalid') ||
        error.message.includes('must be')
      ) {
        return reply.code(400).send({ message: error.message });
      }
      return reply.code(400).send({ message: error.message });
    }
  }

  async deletePatient(request, reply) {
    try {
      await patientService.deleteCustomer(request.params.id, request.tenantId);
      return reply.send({ success: true, message: 'Patient record archived successfully' });
    } catch (error) {
      return reply.code(404).send({ success: false, message: error.message });
    }
  }

  async searchPatients(request, reply) {
    try {
      const patients = await patientService.searchCustomers(request.tenantId, request.query.q);
      return reply.send({ success: true, data: patients });
    } catch (error) {
      return reply.code(500).send({ success: false, message: error.message });
    }
  }

  async getRecentPatients(request, reply) {
    try {
      const patients = await patientService.getCustomers(request.tenantId, {
        page: 1,
        limit: parseInt(request.query.limit) || 10,
      });
      return reply.send({ success: true, data: patients });
    } catch (error) {
      return reply.code(500).send({ success: false, message: error.message });
    }
  }

  async getPurchaseHistory(request, reply) {
    try {
      const history = await patientService.getPurchaseHistory(request.params.id, request.tenantId);
      return reply.send({ success: true, data: history });
    } catch (error) {
      return reply.code(404).send({ success: false, message: error.message });
    }
  }

  async getPrescriptions(request, reply) {
    try {
      const prescriptions = await patientService.getPrescriptions(
        request.params.id,
        request.tenantId,
      );
      return reply.send({ success: true, data: prescriptions });
    } catch (error) {
      return reply.code(404).send({ success: false, message: error.message });
    }
  }

  async getInvoices(request, reply) {
    try {
      const invoices = await patientService.getInvoices(request.params.id, request.tenantId);
      return reply.send({ success: true, data: invoices });
    } catch (error) {
      return reply.code(404).send({ success: false, message: error.message });
    }
  }

  async getRefills(request, reply) {
    try {
      const refills = await patientService.getRefills(request.params.id, request.tenantId);
      return reply.send({ success: true, data: refills });
    } catch (error) {
      return reply.code(404).send({ success: false, message: error.message });
    }
  }

  async getLoyalty(request, reply) {
    try {
      const account = await loyaltyService.getLoyaltyAccount(request.params.id, request.tenantId);
      return reply.send({
        success: true,
        data: {
          points: account.availablePoints,
          lifetimePoints: account.lifetimePoints,
          tier: account.loyaltyTier,
          history: account.history,
        },
      });
    } catch (error) {
      return reply.code(404).send({ success: false, message: error.message });
    }
  }

  async getCreditLedger(request, reply) {
    try {
      const ledger = await prisma.patientCreditLedger.findMany({
        where: { patientId: request.params.id, tenantId: request.tenantId },
        orderBy: { createdAt: 'desc' },
      });
      return reply.send({ success: true, data: ledger });
    } catch (error) {
      return reply.code(500).send({ success: false, message: error.message });
    }
  }

  async addCredit(request, reply) {
    try {
      let account = await prisma.patientCreditAccount.findFirst({
        where: { patientId: request.params.id, tenantId: request.tenantId },
      });
      if (!account) {
        account = await prisma.patientCreditAccount.create({
          data: { tenantId: request.tenantId, patientId: request.params.id },
        });
      }
      const newBalance = Number(account.outstandingBalance) + Number(request.body.amount);
      await prisma.patientCreditAccount.update({
        where: { id: account.id },
        data: { outstandingBalance: newBalance },
      });
      await prisma.patientCreditLedger.create({
        data: {
          tenantId: request.tenantId,
          accountId: account.id,
          patientId: request.params.id,
          type: 'CREDIT_ISSUED',
          debit: request.body.amount,
          runningBalance: newBalance,
          notes: request.body.reason || 'Manual credit',
        },
      });
      return reply.send({ success: true, data: { newBalance } });
    } catch (error) {
      return reply.code(400).send({ success: false, message: error.message });
    }
  }

  async sendRefillReminder(request, reply) {
    try {
      const result = await communicationsService.sendRefillReminder(
        request.params.id,
        request.tenantId,
        { channel: request.body?.channel },
      );
      return reply.send({ success: true, data: result });
    } catch (error) {
      return reply.code(400).send({ success: false, message: error.message });
    }
  }
}

export default new PatientFastifyController();
