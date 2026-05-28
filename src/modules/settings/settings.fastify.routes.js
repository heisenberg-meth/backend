import settingsController from './controller/settings.fastify.controller.js';
import { authenticate, requireTenant } from '../../middleware/auth.fastify.js';
import { requirePermission } from '../../middleware/permission.fastify.js';

async function settingsRoutes(fastify) {
  fastify.addHook('preHandler', authenticate);
  fastify.addHook('preHandler', requireTenant);

  fastify.get('/', {
    schema: {
      tags: ['Settings'],
      summary: 'Get shop settings'
    }
  }, settingsController.getSettings);

  fastify.put(
    '/',
    {
      schema: {
        tags: ['Settings'],
        summary: 'Update shop settings',
        body: {
          type: 'object',
          properties: {
            lowStock: { type: 'integer' },
            expiryDays: { type: 'integer' },
            theme: { type: 'string', enum: ['light', 'dark'] },
            autoEscalation: { type: 'boolean' },
            auditLogging: { type: 'boolean' },
          },
        },
      },
    },
    settingsController.updateSettings,
  );

  // ── Invoice Template Endpoints ────────────────────────────────

  fastify.get('/invoice-template', {
    schema: {
      tags: ['Settings'],
      summary: 'Get invoice template configuration',
    },
  }, settingsController.getInvoiceTemplate);

  fastify.put('/invoice-template', {
    schema: {
      tags: ['Settings'],
      summary: 'Update invoice template configuration',
      body: {
        type: 'object',
        properties: {
          templateName: { type: 'string' },
          templateType: { type: 'string', enum: ['A4_GST', 'THERMAL_80MM', 'MINIMAL_POS'] },
          invoicePrefix: { type: 'string' },
          paperSize: { type: 'string' },
          showLogo: { type: 'boolean' },
          showDoctorName: { type: 'boolean' },
          showGSTBreakdown: { type: 'boolean' },
          showHSNCode: { type: 'boolean' },
          showQRCode: { type: 'boolean' },
          showExpiryDate: { type: 'boolean' },
          showBatchNumber: { type: 'boolean' },
          footerText: { type: 'string' },
          logoUrl: { type: 'string' },
          gstin: { type: 'string' },
          storeName: { type: 'string' },
          changeReason: { type: 'string' },
        },
      },
    },
  }, settingsController.updateInvoiceTemplate);

  fastify.post('/invoice-template/preview', {
    schema: {
      tags: ['Settings'],
      summary: 'Preview invoice template with sample data',
    },
    preHandler: [requirePermission('settings.invoice.update')],
  }, settingsController.previewInvoiceTemplate);

  fastify.get('/invoice-template/versions', {
    schema: {
      tags: ['Settings'],
      summary: 'List invoice template version history',
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'integer', default: 50 },
          offset: { type: 'integer', default: 0 },
        },
      },
    },
    preHandler: [requirePermission('settings.invoice.read')],
  }, settingsController.getInvoiceTemplateVersions);

  fastify.post('/invoice-template/restore/:versionId', {
    schema: {
      tags: ['Settings'],
      summary: 'Restore invoice template to a previous version',
      params: {
        type: 'object',
        required: ['versionId'],
        properties: {
          versionId: { type: 'string' },
        },
      },
    },
    preHandler: [requirePermission('settings.invoice.update')],
  }, settingsController.restoreInvoiceTemplateVersion);

  fastify.post('/invoice-template/test-render', {
    schema: {
      tags: ['Settings'],
      summary: 'Validate template configuration for different output formats',
    },
    preHandler: [requirePermission('settings.invoice.update')],
  }, settingsController.testRenderInvoiceTemplate);

  // ── GST Settings ────────────────────────────────────────────

  fastify.get('/gst', {
    schema: {
      tags: ['Settings'],
      summary: 'Get GST rate configuration',
      querystring: {
        type: 'object',
        properties: {
          branchId: { type: 'string' },
        },
      },
    },
  }, settingsController.getGstSettings);

  fastify.put('/gst', {
    schema: {
      tags: ['Settings'],
      summary: 'Update GST settings',
      body: {
        type: 'object',
        properties: {
          data: { type: 'object' },
        },
      },
    },
  }, settingsController.updateGstSettings);

  fastify.get('/gst/history/:category', {
    schema: {
      tags: ['Settings'],
      summary: 'Get GST version history by category',
      params: {
        type: 'object',
        required: ['category'],
        properties: {
          category: { type: 'string' },
        },
      },
      querystring: {
        type: 'object',
        properties: {
          branchId: { type: 'string' },
        },
      },
    },
  }, settingsController.getGstVersionHistory);
}

export default settingsRoutes;
