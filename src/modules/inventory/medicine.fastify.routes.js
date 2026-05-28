import medicineController from './controller/medicine.fastify.controller.js';
import categoryController from '../medicine-categories/fastify/category.fastify.controller.js';
import manufacturerController from '../manufacturers/fastify/manufacturer.fastify.controller.js';
import batchController from '../batches/fastify/batch.fastify.controller.js';
import { authenticate, requireTenant } from '../../middleware/auth.fastify.js';
import { requireBranch } from '../../middleware/requireBranch.js';

async function medicineRoutes(fastify) {
  // Apply authentication to all routes in this plugin
  fastify.addHook('preHandler', authenticate);
  fastify.addHook('preHandler', requireTenant);
  fastify.addHook('preHandler', requireBranch);

  // Medicines
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
            branchId: { type: 'string' },
            minQty: { type: 'integer' },
            sortBy: { type: 'string' },
            order: { type: 'string', enum: ['asc', 'desc'] },
          },
        },
      },
    },
    medicineController.getMedicines,
  );

  fastify.get('/medicines/search', {
    schema: {
      tags: ['Inventory'],
      querystring: { type: 'object', properties: { q: { type: 'string' } } }
    },
    handler: medicineController.getMedicines
  });

  fastify.get('/medicines/autocomplete', {
    schema: {
      tags: ['Inventory'],
      querystring: { type: 'object', properties: { q: { type: 'string' } } }
    },
    handler: medicineController.getMedicines
  });

  fastify.get('/medicines/barcode/:barcode', {
    schema: {
      tags: ['Inventory'],
      params: { type: 'object', properties: { barcode: { type: 'string' } } }
    },
    handler: medicineController.getMedicineByBarcode
  });

  fastify.get('/medicines/:id', {
    schema: {
      tags: ['Inventory'],
      params: { type: 'object', properties: { id: { type: 'string' } } }
    }
  }, medicineController.getMedicine);

  fastify.post('/medicines', {
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
          initialBatch: { type: 'object' }
        }
      }
    }
  }, medicineController.createMedicine);

  fastify.put('/medicines/:id', {
    schema: {
      tags: ['Inventory'],
      params: { type: 'object', properties: { id: { type: 'string' } } }
    }
  }, medicineController.updateMedicine);

  fastify.delete('/medicines/:id', {
    preHandler: [authenticate, requireTenant],
    schema: {
      tags: ['Inventory'],
      params: { type: 'object', properties: { id: { type: 'string' } } }
    }
  }, medicineController.deleteMedicine);

  // Categories
  fastify.get('/categories', {
    schema: { tags: ['Inventory'], summary: 'List categories' },
    handler: categoryController.getCategories
  });

  fastify.post('/categories', {
    schema: { tags: ['Inventory'], summary: 'Create category' },
    handler: categoryController.createCategory
  });

  fastify.put('/categories/:id', {
    schema: { tags: ['Inventory'], summary: 'Update category' },
    handler: categoryController.updateCategory
  });

  fastify.delete('/categories/:id', {
    schema: { tags: ['Inventory'], summary: 'Delete category' },
    handler: categoryController.deleteCategory
  });

  // Manufacturers
  fastify.get('/manufacturers', {
    schema: { tags: ['Inventory'], summary: 'List manufacturers' },
    handler: manufacturerController.getManufacturers
  });

  fastify.post('/manufacturers', {
    schema: { tags: ['Inventory'], summary: 'Create manufacturer' },
    handler: manufacturerController.createManufacturer
  });

  fastify.put('/manufacturers/:id', {
    schema: { tags: ['Inventory'], summary: 'Update manufacturer' },
    handler: manufacturerController.updateManufacturer
  });

  fastify.delete('/manufacturers/:id', {
    schema: { tags: ['Inventory'], summary: 'Delete manufacturer' },
    handler: manufacturerController.deleteManufacturer
  });

  // Batches
  fastify.get('/batches', {
    schema: { tags: ['Inventory'], summary: 'List all batches' },
    handler: batchController.getBatches
  });

  fastify.post('/batches', {
    schema: { tags: ['Inventory'], summary: 'Add a batch' },
    handler: batchController.createBatch
  });

  fastify.put('/batches/:id', {
    schema: { tags: ['Inventory'], summary: 'Update batch' },
    handler: batchController.updateBatch
  });

  fastify.delete('/batches/:id', {
    schema: { tags: ['Inventory'], summary: 'Delete batch' },
    handler: batchController.deleteBatch
  });

  // Master & Utilities
  fastify.get('/medicine-master', {
    schema: {
      tags: ['Inventory'],
      querystring: { type: 'object', properties: { q: { type: 'string' } } }
    }
  }, medicineController.searchMaster);

  fastify.get('/medicines/low-stock', {
    schema: { tags: ['Inventory'], summary: 'List low stock medicines' },
    handler: medicineController.getMedicines // getMedicines handles minQty/lowStock via query if implemented, or we can use a dedicated method
  });

  fastify.get('/expiry/near', {
    schema: { tags: ['Inventory'], summary: 'Get near expiry batches' },
    handler: medicineController.getNearExpiry
  });

  fastify.get('/expiry/summary', {
    schema: { tags: ['Inventory'], summary: 'Get expiry summary' },
    handler: medicineController.getExpirySummary
  });

  fastify.post('/batch-recall', {
    schema: {
      tags: ['Inventory'],
      body: {
        type: 'object',
        required: ['batchNumber'],
        properties: {
          batchNumber: { type: 'string' },
          reason: { type: 'string' },
          severity: { type: 'string' }
        }
      }
    }
  }, medicineController.batchRecall);

  fastify.delete('/medicines-clear-all', {
    schema: {
      tags: ['Inventory'],
      summary: 'Clear all medicines for the tenant'
    }
  }, medicineController.clearAllMedicines);

  // Batch Management
  fastify.post('/medicines/:id/batches', {
    schema: {
      tags: ['Inventory'],
      params: { type: 'object', properties: { id: { type: 'string' } } }
    }
  }, medicineController.addBatch);

  // Barcode
  fastify.get('/barcode/generate', {
    schema: {
      tags: ['Inventory'],
      querystring: {
        type: 'object',
        properties: {
          text: { type: 'string' },
          type: { type: 'string', default: 'code128' }
        }
      }
    }
  }, medicineController.getBarcode);
}

export default medicineRoutes;
