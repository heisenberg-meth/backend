import purchaseOrderController from './controller/purchase-order.fastify.controller.js';
import { authenticate, requireTenant } from '../../middleware/auth.fastify.js';
import { requirePermission } from '../../middleware/permission.fastify.js';

async function purchaseOrderRoutes(fastify) {
  fastify.addHook('preHandler', authenticate);
  fastify.addHook('preHandler', requireTenant);

  // ── Dashboard/Shortcuts ─────────────────────────────────────────
  fastify.get(
    '/pending',
    {
      schema: { tags: ['Purchase Orders'], summary: 'Get all pending purchase orders' },
      preHandler: [requirePermission('purchase-orders.read')],
    },
    purchaseOrderController.getPendingOrders,
  );

  fastify.get(
    '/completed',
    {
      schema: { tags: ['Purchase Orders'], summary: 'Get all completed purchase orders' },
      preHandler: [requirePermission('purchase-orders.read')],
    },
    purchaseOrderController.getCompletedOrders,
  );

  fastify.get(
    '/invoices',
    {
      schema: {
        tags: ['Purchase Orders', 'Invoices'],
        summary: 'Get all generated purchase invoices',
      },
      preHandler: [requirePermission('purchase-orders.read')],
    },
    purchaseOrderController.getInvoices,
  );

  fastify.get(
    '/by-supplier/:supplierId',
    {
      schema: {
        tags: ['Purchase Orders'],
        summary: 'Get purchase orders for a specific supplier',
        params: { type: 'object', properties: { supplierId: { type: 'string', format: 'uuid' } } },
      },
      preHandler: [requirePermission('purchase-orders.read')],
    },
    purchaseOrderController.getOrdersBySupplier,
  );

  // ── Core CRUD ───────────────────────────────────────────────────
  fastify.get(
    '/',
    {
      schema: { tags: ['Purchase Orders'], summary: 'Get all purchase orders with filters' },
      preHandler: [requirePermission('purchase-orders.read')],
    },
    purchaseOrderController.getOrders,
  );

  fastify.get(
    '/:id',
    {
      schema: {
        tags: ['Purchase Orders'],
        summary: 'Get purchase order details',
        params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } } },
      },
      preHandler: [requirePermission('purchase-orders.read')],
    },
    purchaseOrderController.getOrder,
  );

  fastify.post(
    '/',
    {
      schema: {
        tags: ['Purchase Orders'],
        summary: 'Create a new purchase order request',
        body: {
          type: 'object',
          required: ['supplierId', 'items', 'subtotal', 'totalAmount'],
          properties: {
            supplierId: { type: 'string', format: 'uuid' },
            branchId: { type: 'string', format: 'uuid' },
            supplierInvoiceNumber: { type: 'string' },
            invoiceDate: { type: 'string', format: 'date-time' },
            items: {
              type: 'array',
              minItems: 1,
              items: {
                type: 'object',
                required: ['medicineId', 'quantity', 'purchasePrice'],
                properties: {
                  medicineId: { type: 'string', format: 'uuid' },
                  quantity: { type: 'integer', minimum: 1 },
                  purchasePrice: { type: 'number', minimum: 0 },
                  sellingPrice: { type: 'number', minimum: 0 },
                  batchNumber: { type: 'string' },
                  expiryDate: { type: 'string' },
                },
              },
            },
            subtotal: { type: 'number' },
            gstAmount: { type: 'number' },
            totalAmount: { type: 'number' },
            notes: { type: 'string' },
          },
        },
      },
      preHandler: [requirePermission('purchase-orders.create')],
    },
    purchaseOrderController.createOrder,
  );

  // ── Workflow Actions ───────────────────────────────────────────
  fastify.post(
    '/:id/approve',
    {
      schema: {
        tags: ['Purchase Orders'],
        summary: 'Approve a purchase order',
        params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } } },
        body: {
          type: 'object',
          properties: { notes: { type: 'string' } },
        },
      },
      preHandler: [requirePermission('purchase-orders.approve')],
    },
    purchaseOrderController.approveOrder,
  );

  fastify.post(
    '/:id/receive',
    {
      schema: {
        tags: ['Purchase Orders'],
        summary: 'Receive inventory items for a purchase order (GRN)',
        params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } } },
        body: {
          type: 'object',
          required: ['receivedItems'],
          properties: {
            receivedItems: {
              type: 'array',
              minItems: 1,
              items: {
                type: 'object',
                required: ['medicineId', 'receivedQuantity', 'batchNumber', 'expiryDate'],
                properties: {
                  medicineId: { type: 'string', format: 'uuid' },
                  receivedQuantity: { type: 'integer', minimum: 1 },
                  batchNumber: { type: 'string' },
                  expiryDate: { type: 'string' },
                  sellingPrice: { type: 'number' },
                  purchasePrice: { type: 'number' },
                  mrp: { type: 'number' },
                },
              },
            },
            notes: { type: 'string' },
          },
        },
      },
      preHandler: [requirePermission('purchase-orders.receive')],
    },
    purchaseOrderController.receiveOrder,
  );

  fastify.post(
    '/:id/cancel',
    {
      schema: {
        tags: ['Purchase Orders'],
        summary: 'Cancel a purchase order',
        params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } } },
        body: {
          type: 'object',
          required: ['reason'],
          properties: { reason: { type: 'string', minLength: 5 } },
        },
      },
      preHandler: [requirePermission('purchase-orders.cancel')],
    },
    purchaseOrderController.cancelOrder,
  );

  fastify.patch(
    '/:id/status',
    {
      schema: {
        tags: ['Purchase Orders'],
        summary: 'Update purchase order status manually',
        params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } } },
        body: {
          type: 'object',
          required: ['status'],
          properties: { status: { type: 'string' } },
        },
      },
      preHandler: [requirePermission('purchase-orders.update')],
    },
    purchaseOrderController.updateStatus,
  );
}

export default purchaseOrderRoutes;
