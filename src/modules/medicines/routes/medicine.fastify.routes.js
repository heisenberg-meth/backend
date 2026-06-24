import medicineController from '../controllers/medicine.fastify.controller.js';
import prisma from '../../../config/prisma.js';
import { authenticate, requireTenant } from '../../../middleware/auth.fastify.js';
import { requirePermission } from '../../../middleware/permission.fastify.js';

async function medicineIntelligenceRoutes(fastify) {
  fastify.addHook('preHandler', authenticate);
  fastify.addHook('preHandler', requireTenant);

  // --- Medicine Search & Retrieval ---
  fastify.get(
    '/',
    {
      schema: {
        tags: ['Medicines'],
        querystring: {
          type: 'object',
          properties: {
            q: { type: 'string' },
            categoryId: { type: 'string', format: 'uuid' },
            schedule: { type: 'string' },
            page: { type: 'integer', default: 1 },
            limit: { type: 'integer', default: 50 },
          },
        },
      },
    },
    medicineController.getMedicines,
  );

  fastify.get(
    '/:id',
    {
      schema: {
        tags: ['Medicines'],
        params: {
          type: 'object',
          properties: { id: { type: 'string', format: 'uuid' } },
        },
      },
    },
    medicineController.getMedicine,
  );

  // --- Master Registry ---
  fastify.post(
    '/',
    {
      schema: {
        tags: ['Medicines'],
        body: {
          type: 'object',
          required: ['medicineName', 'genericName', 'manufacturer', 'categoryId', 'medicineType', 'dosageForm', 'strength'],
          properties: {
            medicineName: { type: 'string', minLength: 1 },
            genericName: { type: 'string', minLength: 1 },
            brandName: { type: 'string' },
            manufacturer: { type: 'string', minLength: 1 },
            categoryId: { type: 'string', format: 'uuid' },
            category: { type: 'string' },
            medicineType: { 
              type: 'string',
              enum: ['TABLET', 'CAPSULE', 'SYRUP', 'SUSPENSION', 'INJECTION', 'DROPS', 'CREAM', 'GEL', 'OINTMENT', 'POWDER', 'INHALER', 'SPRAY', 'MEDICAL_DEVICE']
            },
            dosageForm: { type: 'string' },
            strength: { type: 'string', minLength: 1 },
            schedule: { 
              type: 'string',
              enum: ['OTC', 'SCHEDULE_H', 'SCHEDULE_H1', 'SCHEDULE_X']
            },
            purchaseUnit: { 
              type: 'string',
              enum: ['BOX', 'CARTON', 'BOTTLE', 'TUBE', 'PIECE']
            },
            sellingUnit: { 
              type: 'string',
              enum: ['TABLET', 'CAPSULE', 'STRIP', 'BOTTLE', 'TUBE', 'PIECE', 'VIAL']
            },
            unitPerPack: { type: 'integer', minimum: 1 },
            gstPercentage: { type: 'number', enum: [0, 5, 12, 18, 28] },
            hsnCode: { type: 'string' },
            barcode: { type: 'string' },
            sku: { type: 'string' },
            requiresPrescription: { type: 'boolean', default: false },
            storageCondition: { type: 'string' },
            status: { 
              type: 'string',
              enum: ['ACTIVE', 'INACTIVE', 'DISCONTINUED'],
              default: 'ACTIVE'
            },
            notes: { type: 'string' },
            // Legacy fields for backward compatibility
            name: { type: 'string' },
            scheduleType: { type: 'string' },
            composition: { type: 'string' },
            description: { type: 'string' },
          },
        },
      },
      preHandler: [requirePermission('CREATE_INVENTORY')],
    },
    medicineController.createMedicine,
  );

  fastify.put(
    '/:id',
    {
      schema: {
        tags: ['Medicines'],
        params: {
          type: 'object',
          properties: { id: { type: 'string', format: 'uuid' } },
        },
      },
      preHandler: [requirePermission('UPDATE_INVENTORY')],
    },
    medicineController.updateMedicine,
  );

  fastify.delete(
    '/:id',
    {
      schema: {
        tags: ['Medicines'],
        params: {
          type: 'object',
          properties: { id: { type: 'string', format: 'uuid' } },
        },
      },
      preHandler: [requirePermission('DELETE_INVENTORY')],
    },
    medicineController.deleteMedicine,
  );

  fastify.get(
    '/interactions',
    {
      schema: {
        tags: ['Medicines'],
        querystring: {
          type: 'object',
          required: ['medicineIds'],
          properties: {
            medicineIds: { type: 'array', items: { type: 'string', format: 'uuid' } },
          },
        },
      },
    },
    async (request) => {
      const { tenantId } = request.user;
      const { medicineIds } = request.query;
      // Logic to find all interactions within the provided set of medicines
      const interactions = await prisma.drugInteraction.findMany({
        where: {
          tenantId,
          OR: [{ medicineId: { in: medicineIds }, interactsWithId: { in: medicineIds } }],
        },
        include: {
          medicine: { select: { name: true } },
          interactsWith: { select: { name: true } },
        },
      });
      return interactions;
    },
  );
}

export default medicineIntelligenceRoutes;
