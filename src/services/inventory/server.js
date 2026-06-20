import createServiceApp from '../../shared/app-factory.js';
import medicineRoutes from '../../modules/inventory/medicine.fastify.routes.js';
import purchaseOrderRoutes from '../../modules/purchase-orders/purchase-order.fastify.routes.js';
import inventoryIntegrityService from '../../modules/inventory/service/inventory-integrity.service.js';

const start = async () => {
  const app = await createServiceApp({
    name: 'Inventory Service',
    description: 'Handles medicines, inventory, and purchase orders',
  });

  await app.register(medicineRoutes, { prefix: '/api/inventory' });
  await app.register(purchaseOrderRoutes, { prefix: '/api/purchase-orders' });

  const port = process.env.SERVICE_PORT || 5002;

  // Run inventory integrity audit before accepting traffic
  await inventoryIntegrityService.runStartupAudit();

  await app.listen({ port, host: '0.0.0.0' });
};

start();
