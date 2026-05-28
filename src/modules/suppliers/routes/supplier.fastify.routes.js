import supplierController from '../fastify/supplier.fastify.controller.js';
import { authenticate, requireTenant } from '../../../middleware/auth.fastify.js';
import { requirePermission } from '../../../middleware/permission.fastify.js';

async function supplierFastifyRoutes(fastify) {
  fastify.addHook('preHandler', authenticate);
  fastify.addHook('preHandler', requireTenant);

  fastify.get('/', {
    schema: { tags: ['Suppliers'], summary: 'List suppliers with search & pagination' },
    preHandler: [requirePermission('suppliers.read')],
  }, supplierController.getSuppliers);

  fastify.get('/stats', {
    schema: { tags: ['Suppliers'], summary: 'Supplier statistics' },
    preHandler: [requirePermission('suppliers.read')],
  }, supplierController.getStats);

  fastify.get('/compare', {
    schema: { tags: ['Suppliers'], summary: 'Compare multiple suppliers' },
    preHandler: [requirePermission('suppliers.read')],
  }, supplierController.compareSuppliers);

  fastify.get('/rankings', {
    schema: { tags: ['Suppliers'], summary: 'Supplier rankings by score' },
    preHandler: [requirePermission('suppliers.read')],
  }, supplierController.getRankings);

  fastify.post('/', {
    schema: { tags: ['Suppliers'], summary: 'Create a new supplier' },
    preHandler: [requirePermission('suppliers.create')],
  }, supplierController.createSupplier);

  fastify.get('/:id', {
    schema: { tags: ['Suppliers'], summary: 'Get supplier by ID' },
    preHandler: [requirePermission('suppliers.read')],
  }, supplierController.getSupplierById);

  fastify.put('/:id', {
    schema: { tags: ['Suppliers'], summary: 'Update supplier' },
    preHandler: [requirePermission('suppliers.update')],
  }, supplierController.updateSupplier);

  fastify.delete('/:id', {
    schema: { tags: ['Suppliers'], summary: 'Archive supplier' },
    preHandler: [requirePermission('suppliers.delete')],
  }, supplierController.deleteSupplier);

  fastify.get('/:id/performance', {
    schema: { tags: ['Suppliers'], summary: 'Supplier performance metrics' },
    preHandler: [requirePermission('suppliers.read')],
  }, supplierController.getPerformance);

  fastify.get('/:id/purchase-history', {
    schema: { tags: ['Suppliers'], summary: 'Purchase history for a supplier' },
    preHandler: [requirePermission('suppliers.read')],
  }, supplierController.getPurchaseHistory);

  fastify.get('/:id/pending-payments', {
    schema: { tags: ['Suppliers'], summary: 'Pending payments to supplier' },
    preHandler: [requirePermission('suppliers.financial.read')],
  }, supplierController.getPendingPayments);

  fastify.get('/:id/medicines', {
    schema: { tags: ['Suppliers'], summary: 'Medicines supplied by this supplier' },
    preHandler: [requirePermission('suppliers.read')],
  }, supplierController.getDrugs);

  fastify.get('/:id/delivery-history', {
    schema: { tags: ['Suppliers'], summary: 'Delivery history' },
    preHandler: [requirePermission('suppliers.read')],
  }, supplierController.getDeliveryHistory);

  fastify.get('/:id/spend-analysis', {
    schema: { tags: ['Suppliers'], summary: 'Spend analysis for supplier' },
    preHandler: [requirePermission('suppliers.financial.read')],
  }, supplierController.getSpendAnalysis);

  fastify.get('/:id/risk-alerts', {
    schema: { tags: ['Suppliers'], summary: 'Risk alerts for supplier' },
    preHandler: [requirePermission('suppliers.read')],
  }, supplierController.getRiskAlerts);

  fastify.get('/:id/reconciliation', {
    schema: { tags: ['Suppliers'], summary: 'Invoice reconciliation' },
    preHandler: [requirePermission('suppliers.financial.read')],
  }, supplierController.getReconciliation);

  fastify.get('/:id/ledger', {
    schema: { tags: ['Suppliers'], summary: 'Supplier financial ledger' },
    preHandler: [requirePermission('suppliers.financial.read')],
  }, supplierController.getLedger);

  fastify.post('/:id/payments', {
    schema: { tags: ['Suppliers'], summary: 'Record payment to supplier' },
    preHandler: [requirePermission('suppliers.financial.create')],
  }, supplierController.recordPayment);
}

export default supplierFastifyRoutes;
