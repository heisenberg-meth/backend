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

  const updateSchema = {
    tags: ['Purchase Orders'],
    summary: 'Update a draft purchase order',
    params: { type: 'object', properties: { id: { type: 'string' } } },
    body: {
      type: 'object',
      properties: {
        supplierId: { type: 'string' },
        branchId: { type: 'string' },
        expectedDeliveryDate: { type: 'string' },
        paymentMode: { type: 'string' },
        paymentTermsDays: { type: 'integer', minimum: 0, maximum: 365 },
        notes: { type: 'string', maxLength: 500 },
        discountAmount: { type: 'number' },
        advancePaid: { type: 'number' },
        items: {
          type: 'array',
          items: {
            type: 'object',
            required: ['medicineId', 'quantity'],
            properties: {
              medicineId: { type: 'string' },
              quantity: { type: 'integer', minimum: 1 },
              unitPrice: { type: 'number' },
              purchasePrice: { type: 'number' },
              gstPercentage: { type: 'number' },
            },
          },
        },
      },
    },
  };

  fastify.put(
    '/:id',
    {
      schema: updateSchema,
      preHandler: [requirePermission('purchase-orders.update')],
    },
    purchaseOrderController.updateDraftOrder,
  );

  fastify.patch(
    '/:id',
    {
      schema: updateSchema,
      preHandler: [requirePermission('purchase-orders.update')],
    },
    purchaseOrderController.updateDraftOrder,
  );

  fastify.delete(
    '/:id',
    {
      schema: {
        tags: ['Purchase Orders'],
        summary: 'Soft-delete a draft purchase order',
        params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } } },
      },
      preHandler: [requirePermission('purchase-orders.update')],
    },
    purchaseOrderController.deleteDraftOrder,
  );

  fastify.post(
    '/',
    {
      schema: {
        tags: ['Purchase Orders'],
        summary: 'Create a new purchase order',
        description:
          'Creates a PO in DRAFT status. Only ordering information is captured here (supplier, branch, medicines, quantities). Purchase price, GST, batch, expiry, MRP, and invoice details belong to the GRN stage — use POST /:id/receive for that.',
        body: {
          type: 'object',
          required: ['supplierId', 'items'],
          properties: {
            supplierId: { type: 'string', format: 'uuid' },
            branchId: { type: 'string', format: 'uuid' },
            expectedDeliveryDate: { type: 'string', format: 'date' },
            paymentMode: {
              type: 'string',
              enum: ['CASH', 'CREDIT', 'UPI', 'BANK_TRANSFER', 'CHEQUE'],
            },
            paymentTermsDays: { type: 'integer', minimum: 0, maximum: 365 },
            notes: { type: 'string', maxLength: 500 },
            items: {
              type: 'array',
              minItems: 1,
              maxItems: 100,
              items: {
                type: 'object',
                required: ['medicineId', 'quantity'],
                properties: {
                  medicineId: { type: 'string', format: 'uuid' },
                  quantity: { type: 'integer', minimum: 1 },
                },
              },
            },
          },
        },
        response: {
          201: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              message: { type: 'string' },
              data: {
                type: 'object',
                properties: {
                  id: { type: 'string', format: 'uuid' },
                  orderNumber: { type: 'string' },
                  status: { type: 'string' },
                  supplierId: { type: 'string', format: 'uuid' },
                  branchId: { type: 'string', format: 'uuid' },
                  expectedDeliveryDate: { type: 'string', format: 'date' },
                  paymentMode: { type: 'string' },
                  paymentTermsDays: { type: 'integer' },
                  notes: { type: 'string' },
                  createdAt: { type: 'string', format: 'date-time' },
                  items: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        id: { type: 'string', format: 'uuid' },
                        medicineId: { type: 'string', format: 'uuid' },
                        medicineName: { type: 'string' },
                        quantity: { type: 'integer' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      preHandler: [requirePermission('purchase-orders.create')],
    },
    purchaseOrderController.createOrder,
  );

  // ── Workflow Actions ───────────────────────────────────────────
  fastify.post(
    '/:id/submit',
    {
      schema: {
        tags: ['Purchase Orders'],
        summary: 'Submit a purchase order for approval',
        params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } } },
      },
      preHandler: [requirePermission('purchase-orders.update')],
    },
    purchaseOrderController.submitOrder,
  );

  fastify.post(
    '/:id/request-approval',
    {
      schema: {
        tags: ['Purchase Orders'],
        summary: 'Route a purchase order to the correct approval tier',
        params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } } },
      },
      preHandler: [requirePermission('purchase-orders.update')],
    },
    purchaseOrderController.requestApproval,
  );

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
    '/:id/reject',
    {
      schema: {
        tags: ['Purchase Orders'],
        summary: 'Reject a purchase order',
        params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } } },
        body: {
          type: 'object',
          required: ['reason'],
          properties: { reason: { type: 'string', minLength: 3 } },
        },
      },
      preHandler: [requirePermission('purchase-orders.approve')],
    },
    purchaseOrderController.rejectOrder,
  );

  fastify.post(
    '/:id/send',
    {
      schema: {
        tags: ['Purchase Orders'],
        summary: 'Send an approved purchase order to the supplier',
        params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } } },
      },
      preHandler: [requirePermission('purchase-orders.update')],
    },
    purchaseOrderController.sendOrder,
  );

  fastify.post(
    '/:id/acknowledge',
    {
      schema: {
        tags: ['Purchase Orders'],
        summary: 'Record supplier acknowledgement',
        params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } } },
      },
      preHandler: [requirePermission('purchase-orders.update')],
    },
    purchaseOrderController.acknowledgeOrder,
  );

  fastify.post(
    '/:id/revise',
    {
      schema: {
        tags: ['Purchase Orders'],
        summary: 'Revise supplier-facing PO quantities',
        params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } } },
      },
      preHandler: [requirePermission('purchase-orders.update')],
    },
    purchaseOrderController.reviseOrder,
  );

  fastify.post(
    '/:id/receive',
    {
      schema: {
        tags: ['Purchase Orders'],
        summary: 'Receive goods for a purchase order (GRN)',
        description:
          'Records actual supplier delivery. This is where batchNumber, expiryDate, MRP, purchasePrice, gstPercentage, and invoice details are captured. Creates inventory batches, purchase invoices, and supplier ledger entries.',
        params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } } },
        body: {
          type: 'object',
          required: ['supplierInvoiceNumber', 'invoiceDate', 'receivedItems'],
          properties: {
            supplierInvoiceNumber: { type: 'string', minLength: 1 },
            invoiceDate: { type: 'string', format: 'date' },
            receivedItems: {
              type: 'array',
              minItems: 1,
              items: {
                type: 'object',
                required: [
                  'medicineId',
                  'receivedQuantity',
                  'batchNumber',
                  'expiryDate',
                  'purchasePrice',
                  'mrp',
                ],
                properties: {
                  medicineId: { type: 'string', format: 'uuid' },
                  receivedQuantity: { type: 'integer', minimum: 1 },
                  batchNumber: { type: 'string', minLength: 1 },
                  expiryDate: { type: 'string', format: 'date' },
                  manufacturingDate: { type: 'string', format: 'date' },
                  purchasePrice: { type: 'number', exclusiveMinimum: 0 },
                  mrp: { type: 'number', exclusiveMinimum: 0 },
                  gstPercentage: { type: 'number', minimum: 0, maximum: 100, default: 0 },
                },
              },
            },
            notes: { type: 'string', maxLength: 500 },
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

  fastify.patch(
    '/invoices/:id/payment-status',
    {
      schema: {
        tags: ['Purchase Orders', 'Invoices'],
        summary: 'Update purchase invoice payment status',
        params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } } },
        body: {
          type: 'object',
          required: ['paymentStatus'],
          properties: {
            paymentStatus: { type: 'string', enum: ['PENDING', 'PAID', 'PARTIAL'] },
            paidAmount: { type: 'number', minimum: 0 },
            notes: { type: 'string' },
          },
        },
      },
      preHandler: [requirePermission('purchase-orders.update')],
    },
    purchaseOrderController.updateInvoicePaymentStatus,
  );

  // ── Smart Reorder ──────────────────────────────────────────────
  fastify.post(
    '/reorder',
    {
      schema: {
        tags: ['Purchase Orders'],
        summary:
          'Create a one-click reorder PO from inventory — auto-fills medicine, supplier, and pricing',
        body: {
          type: 'object',
          required: ['medicineId', 'quantity'],
          properties: {
            medicineId: { type: 'string', format: 'uuid' },
            quantity: { type: 'integer', minimum: 1 },
          },
        },
      },
      preHandler: [requirePermission('purchase-orders.create')],
    },
    purchaseOrderController.createReorder,
  );

  // ── PDF Generation ─────────────────────────────────────────────
  fastify.get(
    '/:id/pdf',
    {
      schema: {
        tags: ['Purchase Orders'],
        summary: 'Generate a printable HTML purchase order document',
        params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } } },
      },
      preHandler: [requirePermission('purchase-orders.read')],
    },
    purchaseOrderController.generatePdf,
  );

  fastify.get(
    '/:id/audit',
    {
      schema: {
        tags: ['Purchase Orders'],
        summary: 'Get purchase order audit trail',
        params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } } },
      },
      preHandler: [requirePermission('purchase-orders.read')],
    },
    purchaseOrderController.getAudit,
  );
}

export default purchaseOrderRoutes;
