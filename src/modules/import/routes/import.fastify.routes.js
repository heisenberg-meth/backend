import controller from '../fastify/import.fastify.controller.js';
import { authenticate, requireTenant } from '../../../middleware/auth.fastify.js';
import { requirePermission } from '../../../middleware/permission.fastify.js';
import { requireBranch } from '../../../middleware/requireBranch.js';

export default async function (fastify) {
  fastify.addHook('preHandler', authenticate);
  fastify.addHook('preHandler', requireTenant);
  fastify.addHook('preHandler', requireBranch);

  fastify.post('/pdf-invoice', {
    schema: { tags: ['Import'], summary: 'Import PDF invoice' },
    preHandler: [requirePermission('CREATE_BILL')],
    handler: controller.importPdfInvoice,
  });

  fastify.get('/history', {
    schema: { tags: ['Import'], summary: 'Get import history' },
    preHandler: [requirePermission('VIEW_INVENTORY')],
    handler: controller.getImportHistory,
  });

  fastify.get('/history/:id', {
    schema: { tags: ['Import'], summary: 'Get import by ID' },
    preHandler: [requirePermission('VIEW_INVENTORY')],
    handler: controller.getImportById,
  });

  fastify.get('/:id/ocr-preview', {
    schema: { tags: ['Import'], summary: 'Get OCR preview' },
    preHandler: [requirePermission('VIEW_INVENTORY')],
    handler: controller.getOcrPreview,
  });

  fastify.post('/:id/reprocess', {
    schema: { tags: ['Import'], summary: 'Reprocess import' },
    preHandler: [requirePermission('CREATE_BILL')],
    handler: controller.reprocessImport,
  });

  fastify.get('/:id/errors', {
    schema: { tags: ['Import'], summary: 'Get import errors' },
    preHandler: [requirePermission('VIEW_INVENTORY')],
    handler: controller.getImportErrors,
  });

  fastify.post('/supplier-invoice', {
    schema: { tags: ['Import'], summary: 'Import supplier invoice' },
    preHandler: [requirePermission('CREATE_BILL')],
    handler: controller.importSupplierInvoice,
  });

  fastify.post('/:id/approve', {
    schema: { tags: ['Import'], summary: 'Approve import' },
    preHandler: [requirePermission('MANAGE_USERS')],
    handler: controller.approveImport,
  });

  fastify.post('/bulk', {
    schema: { tags: ['Import'], summary: 'Bulk medicine import' },
    preHandler: [requirePermission('CREATE_BILL')],
    handler: controller.bulkImport,
  });

  fastify.post('/upload', {
    schema: { tags: ['Import'], summary: 'Upload CSV for bulk import' },
    preHandler: [requirePermission('CREATE_BILL')],
    handler: controller.uploadCsv,
  });

  fastify.get('/status/:jobId', {
    schema: { tags: ['Import'], summary: 'Get import job progress' },
    handler: controller.getImportStatus,
  });
}
