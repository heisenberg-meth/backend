import controller from '../controllers/patient-features.fastify.controller.js';
import { authenticate, requireTenant } from '../../../middleware/auth.fastify.js';
import { requirePermission } from '../../../middleware/permission.fastify.js';

async function patientFeaturesRoutes(fastify) {
  fastify.addHook('preHandler', authenticate);
  fastify.addHook('preHandler', requireTenant);

  fastify.get(
    '/:id/purchase-history',
    {
      preHandler: [requirePermission('patients.history.read')],
      schema: {
        tags: ['Patients', 'Features'],
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string', format: 'uuid' } },
        },
        querystring: {
          type: 'object',
          properties: {
            from: { type: 'string', format: 'date' },
            to: { type: 'string', format: 'date' },
            medicineId: { type: 'string', format: 'uuid' },
            page: { type: 'integer', minimum: 1, default: 1 },
            limit: { type: 'integer', minimum: 1, maximum: 100, default: 50 },
          },
        },
      },
    },
    controller.getPurchaseHistory,
  );

  fastify.get(
    '/:id/prescriptions',
    {
      preHandler: [requirePermission('patients.prescriptions.read')],
      schema: {
        tags: ['Patients', 'Features'],
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string', format: 'uuid' } },
        },
      },
    },
    controller.getPrescriptions,
  );

  fastify.get(
    '/:id/invoices',
    {
      preHandler: [requirePermission('patients.history.read')],
      schema: {
        tags: ['Patients', 'Features'],
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string', format: 'uuid' } },
        },
        querystring: {
          type: 'object',
          properties: {
            from: { type: 'string', format: 'date' },
            to: { type: 'string', format: 'date' },
            page: { type: 'integer', minimum: 1, default: 1 },
            limit: { type: 'integer', minimum: 1, maximum: 100, default: 50 },
          },
        },
      },
    },
    controller.getInvoices,
  );

  fastify.get(
    '/:id/refills',
    {
      preHandler: [requirePermission('patients.refills.read')],
      schema: {
        tags: ['Patients', 'Features'],
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string', format: 'uuid' } },
        },
      },
    },
    controller.getRefills,
  );

  fastify.get(
    '/:id/timeline',
    {
      preHandler: [requirePermission('patients.history.read')],
      schema: {
        tags: ['Patients', 'Features'],
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string', format: 'uuid' } },
        },
      },
    },
    controller.getTimeline,
  );

  fastify.get(
    '/:id/adherence',
    {
      preHandler: [requirePermission('patients.history.read')],
      schema: {
        tags: ['Patients', 'Features'],
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string', format: 'uuid' } },
        },
      },
    },
    controller.getAdherence,
  );

  fastify.get(
    '/:id/chronic-medicines',
    {
      preHandler: [requirePermission('patients.history.read')],
      schema: {
        tags: ['Patients', 'Features'],
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string', format: 'uuid' } },
        },
      },
    },
    controller.getChronicMedicines,
  );

  fastify.get(
    '/refills/upcoming',
    {
      preHandler: [requirePermission('patients.refills.read')],
      schema: {
        tags: ['Patients', 'Features'],
        querystring: {
          type: 'object',
          properties: {
            daysAhead: { type: 'integer', minimum: 1, maximum: 90, default: 7 },
          },
        },
      },
    },
    controller.getUpcomingRefills,
  );

  fastify.get(
    '/prescriptions/:prescriptionId/validity',
    {
      preHandler: [requirePermission('patients.prescriptions.read')],
      schema: {
        tags: ['Patients', 'Features'],
        params: {
          type: 'object',
          required: ['prescriptionId'],
          properties: { prescriptionId: { type: 'string', format: 'uuid' } },
        },
      },
    },
    controller.checkPrescriptionValidity,
  );
}

export default patientFeaturesRoutes;
