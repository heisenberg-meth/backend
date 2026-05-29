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
            limit: { type: 'integer', default: 50 }
          }
        }
      }
    },
    medicineController.getMedicines
  );

  fastify.get(
    '/:id',
    {
      schema: {
        tags: ['Medicines'],
        params: {
          type: 'object',
          properties: { id: { type: 'string', format: 'uuid' } }
        }
      }
    },
    medicineController.getMedicine
  );

  // --- Master Registry ---
  fastify.post(
    '/',
    {
      schema: {
        tags: ['Medicines'],
        body: {
          type: 'object',
          required: ['name'],
          properties: {
            name: { type: 'string' },
            genericName: { type: 'string' },
            composition: { type: 'string' },
            categoryId: { type: 'string', format: 'uuid' },
            category: { type: 'string' },
            manufacturerId: { type: 'string', format: 'uuid' },
            manufacturer: { type: 'string' },
            scheduleType: { type: 'string' },
            gstPercentage: { type: 'number' },
            storageCondition: { type: 'string' },
            barcode: { type: 'string' },
            dosageForm: { type: 'string' },
            strength: { type: 'string' },
            reorderPoint: { type: 'number' },
            reorderLevel: { type: 'number' },
            description: { type: 'string' },
            branchId: { type: 'string', format: 'uuid' },
            pricing: {
              type: 'object',
              properties: {
                mrp: { type: 'number' },
                purchasePrice: { type: 'number' },
                sellingPrice: { type: 'number' }
              }
            },
            initialBatch: {
              type: 'object',
              properties: {
                batchNumber: { type: 'string' },
                quantity: { type: 'number' },
                expiryDate: { type: 'string' },
                mrp: { type: 'number' },
                purchasePrice: { type: 'number' }
              }
            }
          }
        }
      },
      preHandler: [requirePermission('CREATE_INVENTORY')],
    },
    medicineController.createMedicine
  );

  fastify.put(
    '/:id',
    {
      schema: {
        tags: ['Medicines'],
        params: {
          type: 'object',
          properties: { id: { type: 'string', format: 'uuid' } }
        }
      },
      preHandler: [requirePermission('UPDATE_INVENTORY')],
    },
    medicineController.updateMedicine
  );

  fastify.delete(
    '/:id',
    {
      schema: {
        tags: ['Medicines'],
        params: {
          type: 'object',
          properties: { id: { type: 'string', format: 'uuid' } }
        }
      },
      preHandler: [requirePermission('DELETE_INVENTORY')],
    },
    medicineController.deleteMedicine
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
