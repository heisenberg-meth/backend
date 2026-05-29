import paymentController from '../payments/controllers/payment.fastify.controller.js';
import billingController from './fastify/billing.fastify.controller.js';
import { authenticate, requireTenant } from '../../middleware/auth.fastify.js';
import { requireBranch } from '../../middleware/requireBranch.js';

async function billingFastifyRoutes(fastify) {
  fastify.addHook('preHandler', authenticate);
  fastify.addHook('preHandler', requireTenant);
  fastify.addHook('preHandler', requireBranch);

  // --- Invoice Lifecycle ---
  fastify.get('/invoices', {
    schema: { tags: ['Billing'], summary: 'List invoices' },
    handler: billingController.getInvoices
  });

  fastify.post('/invoices', {
    schema: { tags: ['Billing'], summary: 'Create invoice (checkout)' },
    handler: billingController.checkout
  });

  fastify.post('/invoices/draft', {
    schema: { tags: ['Billing'], summary: 'Create draft invoice' },
    handler: billingController.createDraft
  });

  fastify.get('/invoices/:id', {
    schema: { tags: ['Billing'], summary: 'Get invoice details' },
    handler: billingController.getInvoiceById
  });

  fastify.post('/invoices/:id/cancel', {
    schema: { tags: ['Billing'], summary: 'Cancel invoice' },
    handler: billingController.cancelInvoice
  });

  fastify.post('/invoices/:id/refund', {
    schema: { tags: ['Billing'], summary: 'Process invoice refund' },
    handler: billingController.processRefund
  });

  // --- POS Utilities ---
  fastify.get('/scan/:barcode', {
    schema: { tags: ['Billing'], summary: 'Scan item by barcode' },
    handler: billingController.scanItem
  });

  // --- Payment Settlement ---
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
    },
    paymentController.settleInvoice,
  );
  
  // NOTE: Other billing routes (checkout, invoices list) are currently in Express.
  // They should eventually be migrated here for full Fastify support.
}

export default billingFastifyRoutes;
