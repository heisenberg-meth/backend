import medicineController from './controller/medicine.fastify.controller.js';
import categoryController from '../medicine-categories/fastify/category.fastify.controller.js';
import manufacturerController from '../manufacturers/fastify/manufacturer.fastify.controller.js';
import batchController from '../batches/fastify/batch.fastify.controller.js';
import { authenticate, requireTenant } from '../../middleware/auth.fastify.js';
import { requireBranch } from '../../middleware/requireBranch.js';
import { requirePermission } from '../../middleware/permission.fastify.js';
import { requireLimit } from '../../middleware/feature.guard.fastify.js';
import prisma from '../../config/prisma.js';

async function medicineRoutes(fastify) {
  fastify.addHook('preHandler', authenticate);
  fastify.addHook('preHandler', requireTenant);
  fastify.addHook('preHandler', requireBranch);

  fastify.get(
    '/medicines',
    {
      schema: {
        tags: ['Inventory'],
        querystring: {
          type: 'object',
          properties: {
            page: { type: 'integer', default: 1 },
            limit: { type: 'integer', default: 50 },
            search: { type: 'string' },
            q: { type: 'string' },
            categoryId: { type: 'string' },
            manufacturerId: { type: 'string' },
            isActive: { type: ['string', 'boolean'] },
            lowStock: { type: ['string', 'boolean'] },
            status: { type: 'string' },
            branchId: { type: 'string' },
            minQty: { type: 'integer' },
            sortBy: { type: 'string' },
            order: { type: 'string', enum: ['asc', 'desc'] },
          },
        },
      },
      config: { rateLimit: { max: 300, timeWindow: '1 minute' } },
    },
    medicineController.getMedicines,
  );

  fastify.get(
    '/summary',
    {
      schema: {
        tags: ['Inventory'],
        summary: 'Get inventory summary statistics',
        querystring: {
          type: 'object',
          properties: {
            branchId: { type: 'string' },
          },
        },
      },
      preHandler: [requirePermission('VIEW_INVENTORY')],
      config: { rateLimit: { max: 300, timeWindow: '1 minute' } },
    },
    medicineController.getInventorySummaryData,
  );

  fastify.get(
    '/value-summary',
    {
      schema: {
        tags: ['Inventory', 'Analytics'],
        summary: 'Get total inventory value summary',
        querystring: { type: 'object', properties: { branchId: { type: 'string' } } },
      },
      preHandler: [requirePermission('VIEW_INVENTORY')],
      config: { rateLimit: { max: 300, timeWindow: '1 minute' } },
    },
    medicineController.getValueSummary,
  );

  fastify.get(
    '/category-breakdown',
    {
      schema: {
        tags: ['Inventory', 'Analytics'],
        summary: 'Get inventory value breakdown by category',
        querystring: { type: 'object', properties: { branchId: { type: 'string' } } },
      },
      preHandler: [requirePermission('VIEW_INVENTORY')],
      config: { rateLimit: { max: 300, timeWindow: '1 minute' } },
    },
    medicineController.getCategoryBreakdown,
  );

  fastify.get(
    '/high-value-stock',
    {
      schema: {
        tags: ['Inventory', 'Analytics'],
        summary: 'Get top 10 highest value stock items',
        querystring: { type: 'object', properties: { branchId: { type: 'string' } } },
      },
      preHandler: [requirePermission('VIEW_INVENTORY')],
      config: { rateLimit: { max: 300, timeWindow: '1 minute' } },
    },
    medicineController.getHighValueStock,
  );

  fastify.get(
    '/expiry-risk',
    {
      schema: {
        tags: ['Inventory', 'Analytics'],
        summary: 'Get expiry risk breakdown',
        querystring: { type: 'object', properties: { branchId: { type: 'string' } } },
      },
      preHandler: [requirePermission('VIEW_INVENTORY')],
      config: { rateLimit: { max: 300, timeWindow: '1 minute' } },
    },
    medicineController.getExpiryRisk,
  );

  fastify.get('/medicines/search', {
    schema: {
      tags: ['Inventory'],
      querystring: { type: 'object', properties: { q: { type: 'string' } } },
    },
    preHandler: [requirePermission('VIEW_INVENTORY')],
    handler: medicineController.getMedicines,
  });

  fastify.get('/medicines/autocomplete', {
    schema: {
      tags: ['Inventory'],
      querystring: { type: 'object', properties: { q: { type: 'string' } } },
    },
    preHandler: [requirePermission('VIEW_INVENTORY')],
    handler: medicineController.getMedicines,
  });

  fastify.get('/medicines/barcode/:barcode', {
    schema: {
      tags: ['Inventory'],
      params: { type: 'object', properties: { barcode: { type: 'string' } } },
    },
    handler: medicineController.getMedicineByBarcode,
  });

  fastify.get(
    '/medicines/:id',
    {
      schema: {
        tags: ['Inventory'],
        params: { type: 'object', properties: { id: { type: 'string' } } },
      },
    },
    medicineController.getMedicine,
  );

  fastify.post(
    '/medicines',
    {
      schema: {
        tags: ['Inventory'],
        body: {
          type: 'object',
          required: ['name'],
          properties: {
            name: { type: 'string' },
            genericName: { type: 'string' },
            categoryId: { type: 'string' },
            manufacturerId: { type: 'string' },
            gstPercentage: { type: 'number' },
            initialBatch: { type: 'object' },
          },
        },
      },
      preHandler: [
        requirePermission('VIEW_INVENTORY'),
        requireLimit('medicines', async (req) => {
          return await prisma.medicine.count({
            where: { tenantId: req.tenantId, deletedAt: null },
          });
        }),
      ],
    },
    medicineController.createMedicine,
  );

  fastify.put(
    '/medicines/:id',
    {
      schema: {
        tags: ['Inventory'],
        params: { type: 'object', properties: { id: { type: 'string' } } },
      },
      preHandler: [requirePermission('VIEW_INVENTORY')],
    },
    medicineController.updateMedicine,
  );

  fastify.delete(
    '/medicines/:id',
    {
      preHandler: [requirePermission('VIEW_INVENTORY')],
      schema: {
        tags: ['Inventory'],
        params: { type: 'object', properties: { id: { type: 'string' } } },
      },
    },
    medicineController.deleteMedicine,
  );

  fastify.get('/categories', {
    schema: { tags: ['Inventory'], summary: 'List categories' },
    handler: categoryController.getCategories,
  });

  fastify.post('/categories', {
    schema: { tags: ['Inventory'], summary: 'Create category' },
    preHandler: [requirePermission('VIEW_INVENTORY')],
    handler: categoryController.createCategory,
  });

  fastify.put('/categories/:id', {
    schema: { tags: ['Inventory'], summary: 'Update category' },
    preHandler: [requirePermission('VIEW_INVENTORY')],
    handler: categoryController.updateCategory,
  });

  fastify.delete('/categories/:id', {
    schema: { tags: ['Inventory'], summary: 'Delete category' },
    preHandler: [requirePermission('VIEW_INVENTORY')],
    handler: categoryController.deleteCategory,
  });

  fastify.get('/manufacturers', {
    schema: { tags: ['Inventory'], summary: 'List manufacturers' },
    handler: manufacturerController.getManufacturers,
  });

  fastify.post('/manufacturers', {
    schema: { tags: ['Inventory'], summary: 'Create manufacturer' },
    preHandler: [requirePermission('VIEW_INVENTORY')],
    handler: manufacturerController.createManufacturer,
  });

  fastify.put('/manufacturers/:id', {
    schema: { tags: ['Inventory'], summary: 'Update manufacturer' },
    preHandler: [requirePermission('VIEW_INVENTORY')],
    handler: manufacturerController.updateManufacturer,
  });

  fastify.delete('/manufacturers/:id', {
    schema: { tags: ['Inventory'], summary: 'Delete manufacturer' },
    preHandler: [requirePermission('VIEW_INVENTORY')],
    handler: manufacturerController.deleteManufacturer,
  });

  fastify.get('/batches', {
    schema: { tags: ['Inventory'], summary: 'List all batches' },
    handler: batchController.getBatches,
  });

  fastify.post('/batches', {
    schema: { tags: ['Inventory'], summary: 'Add a batch' },
    preHandler: [requirePermission('VIEW_INVENTORY')],
    handler: batchController.createBatch,
  });

  fastify.put('/batches/:id', {
    schema: { tags: ['Inventory'], summary: 'Update batch' },
    preHandler: [requirePermission('VIEW_INVENTORY')],
    handler: batchController.updateBatch,
  });

  fastify.delete('/batches/:id', {
    schema: { tags: ['Inventory'], summary: 'Delete batch' },
    preHandler: [requirePermission('VIEW_INVENTORY')],
    handler: batchController.deleteBatch,
  });

  fastify.get(
    '/medicine-master',
    {
      schema: {
        tags: ['Inventory'],
        querystring: { type: 'object', properties: { q: { type: 'string' } } },
      },
    },
    medicineController.searchMaster,
  );

  fastify.get('/medicines/low-stock', {
    schema: { tags: ['Inventory'], summary: 'List low stock medicines' },
    handler: medicineController.getMedicines,
  });

  fastify.get('/alerts/low-stock', {
    schema: { tags: ['Inventory', 'Alerts'], summary: 'Get unified low stock alerts' },
    handler: medicineController.getLowStockAlerts,
  });

  fastify.get('/expiry/near', {
    schema: { tags: ['Inventory'], summary: 'Get near expiry batches' },
    handler: medicineController.getNearExpiry,
  });

  fastify.get('/expiry/summary', {
    schema: { tags: ['Inventory'], summary: 'Get expiry summary' },
    handler: medicineController.getExpirySummary,
  });

  fastify.post(
    '/batch-recall',
    {
      schema: {
        tags: ['Inventory'],
        body: {
          type: 'object',
          required: ['batchNumber'],
          properties: {
            batchNumber: { type: 'string' },
            reason: { type: 'string' },
            severity: { type: 'string' },
          },
        },
      },
      preHandler: [requirePermission('VIEW_INVENTORY')],
    },
    medicineController.batchRecall,
  );

  fastify.delete(
    '/medicines-clear-all',
    {
      schema: {
        tags: ['Inventory'],
        summary: 'Clear all medicines for the tenant',
      },
      preHandler: [requirePermission('VIEW_INVENTORY')],
    },
    medicineController.clearAllMedicines,
  );

  fastify.post(
    '/medicines/:id/batches',
    {
      schema: {
        tags: ['Inventory'],
        params: { type: 'object', properties: { id: { type: 'string' } } },
      },
      preHandler: [requirePermission('VIEW_INVENTORY')],
    },
    medicineController.addBatch,
  );

  fastify.get(
    '/barcode/generate',
    {
      schema: {
        tags: ['Inventory'],
        querystring: {
          type: 'object',
          properties: {
            text: { type: 'string' },
            type: { type: 'string', default: 'code128' },
          },
        },
      },
    },
    medicineController.getBarcode,
  );
}

export default medicineRoutes;
