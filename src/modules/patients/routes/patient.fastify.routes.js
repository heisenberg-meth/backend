import controller from '../fastify/patient.fastify.controller.js';
import { authenticate, requireTenant } from '../../../middleware/auth.fastify.js';

export default async function (fastify) {
  fastify.addHook('preHandler', authenticate);
  fastify.addHook('preHandler', requireTenant);

  fastify.get('/', {
    schema: { tags: ['Patients'], summary: 'List patients' },
    handler: controller.getPatients,
  });

  fastify.get('/search', {
    schema: { tags: ['Patients'], summary: 'Search patients' },
    handler: controller.searchPatients,
  });

  fastify.get('/recent', {
    schema: { tags: ['Patients'], summary: 'Get recent patients' },
    handler: controller.getRecentPatients,
  });

  fastify.get('/vip', {
    schema: { tags: ['Patients'], summary: 'Get VIP patients' },
    handler: controller.getVipPatients,
  });

  fastify.get('/inactive', {
    schema: { tags: ['Patients'], summary: 'Get inactive patients' },
    handler: controller.getInactivePatients,
  });

  fastify.get('/chronic', {
    schema: { tags: ['Patients'], summary: 'Get chronic patients' },
    handler: controller.getChronicPatients,
  });

  fastify.get('/:id', {
    schema: { tags: ['Patients'], summary: 'Get patient by ID' },
    handler: controller.getPatientById,
  });

  fastify.post('/', {
    schema: { tags: ['Patients'], summary: 'Create patient' },
    handler: controller.createPatient,
  });

  fastify.put('/:id', {
    schema: { tags: ['Patients'], summary: 'Update patient' },
    handler: controller.updatePatient,
  });

  fastify.delete('/:id', {
    schema: { tags: ['Patients'], summary: 'Delete patient' },
    handler: controller.deletePatient,
  });

  fastify.get('/:id/recommendations', {
    schema: { tags: ['Patients'], summary: 'Get patient recommendations' },
    handler: controller.getRecommendations,
  });

  fastify.get('/:id/loyalty', {
    schema: { tags: ['Patients'], summary: 'Get loyalty info' },
    handler: controller.getLoyalty,
  });

  fastify.get('/:id/credit-ledger', {
    schema: { tags: ['Patients'], summary: 'Get patient credit ledger' },
    handler: controller.getCreditLedger,
  });

  fastify.post('/:id/credit', {
    schema: { tags: ['Patients'], summary: 'Add credit' },
    handler: controller.addCredit,
  });

  fastify.post('/:id/refill-reminder', {
    schema: { tags: ['Patients'], summary: 'Send refill reminder' },
    handler: controller.sendRefillReminder,
  });
}
