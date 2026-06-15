import paymentController from '../payments/controllers/payment.fastify.controller.js';
import billingController from './fastify/billing.fastify.controller.js';
import { authenticate, requireTenant } from '../../middleware/auth.fastify.js';
import { requireBranch } from '../../middleware/requireBranch.js';
import { requirePermission } from '../../middleware/permission.fastify.js';

async function billingFastifyRoutes(fastify) {
  fastify.addHook('preHandler', authenticate);
  fastify.addHook('preHandler', requireTenant);
  fastify.addHook('preHandler', requireBranch);

  fastify.get('/invoices', {
    schema: { tags: ['Billing'], summary: 'List invoices' },
    preHandler: [requirePermission('VIEW_BILL')],
    handler: billingController.getInvoices,
  });

  fastify.post('/invoices', {
    schema: { tags: ['Billing'], summary: 'Create invoice (checkout)' },
    preHandler: [requirePermission('CREATE_BILL')],
    handler: billingController.checkout,
  });

  fastify.post('/invoices/draft', {
    schema: { tags: ['Billing'], summary: 'Create draft invoice' },
    preHandler: [requirePermission('CREATE_BILL')],
    handler: billingController.createDraft,
  });

  fastify.put('/invoices/:id', {
    schema: { tags: ['Billing'], summary: 'Update draft invoice' },
    preHandler: [requirePermission('CREATE_BILL')],
    handler: billingController.updateDraft,
  });

  fastify.get('/invoices/:id', {
    schema: { tags: ['Billing'], summary: 'Get invoice details' },
    preHandler: [requirePermission('VIEW_BILL')],
    handler: billingController.getInvoiceById,
  });

  fastify.post('/invoices/:id/cancel', {
    schema: { tags: ['Billing'], summary: 'Cancel invoice' },
    preHandler: [requirePermission('VOID_BILL')],
    handler: billingController.cancelInvoice,
  });

  fastify.post('/invoices/:id/refund', {
    schema: { tags: ['Billing'], summary: 'Process invoice refund' },
    preHandler: [requirePermission('REFUND_BILL')],
    handler: billingController.processRefund,
  });

  fastify.get('/scan/:barcode', {
    schema: { tags: ['Billing'], summary: 'Scan item by barcode' },
    preHandler: [requirePermission('VIEW_BILL')],
    handler: billingController.scanItem,
  });

  fastify.post(
    '/invoices/:id/payment',
    {
      schema: {
        tags: ['Billing', 'Payments'],
        params: {
          type: 'object',
          properties: { id: { type: 'string', format: 'uuid' } },
        },
        body: {
          type: 'object',
          required: ['payments'],
          properties: {
            payments: {
              type: 'array',
              items: {
                type: 'object',
                required: ['method', 'amount'],
                properties: {
                  method: { type: 'string' },
                  amount: { type: 'number' },
                  referenceNumber: { type: 'string' },
                },
              },
            },
            idempotencyKey: { type: 'string' },
          },
        },
      },
      preHandler: [requirePermission('CREATE_BILL')],
    },
    paymentController.settleInvoice,
  );
}

export default billingFastifyRoutes;
