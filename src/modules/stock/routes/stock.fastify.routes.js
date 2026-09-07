import stockController from '../fastify/stock.fastify.controller.js';
import { authenticate, requireTenant } from '../../../middleware/auth.fastify.js';
import { requirePermission } from '../../../middleware/permission.fastify.js';
import {
  stockInSchema,
  stockOutSchema,
  recordDamageSchema,
  getHistorySchema,
  getAlertsSchema,
  resolveAlertSchema,
  getCurrentStockSchema,
} from '../validators/stock.validator.js';

async function stockFastifyRoutes(fastify) {
  fastify.addHook('preHandler', authenticate);
  fastify.addHook('preHandler', requireTenant);

  fastify.post(
    '/in',
    {
      schema: stockInSchema,
      preHandler: [requirePermission('inventory.update')],
    },
    stockController.stockIn,
  );

  fastify.post(
    '/out',
    {
      schema: stockOutSchema,
      preHandler: [requirePermission('inventory.update')],
    },
    stockController.stockOut,
  );

  fastify.post(
    '/damage',
    {
      schema: recordDamageSchema,
      preHandler: [requirePermission('inventory.update')],
    },
    stockController.recordDamage,
  );

  fastify.get(
    '/history',
    {
      schema: getHistorySchema,
      preHandler: [requirePermission('inventory.read')],
    },
    stockController.getHistory,
  );

  fastify.get(
    '/alerts',
    {
      schema: getAlertsSchema,
      preHandler: [requirePermission('inventory.read')],
    },
    stockController.getAlerts,
  );

  fastify.put(
    '/alerts/:id/resolve',
    {
      schema: resolveAlertSchema,
      preHandler: [requirePermission('inventory.update')],
    },
    stockController.resolveAlert,
  );

  fastify.get(
    '/current/:medicineId',
    {
      schema: getCurrentStockSchema,
      preHandler: [requirePermission('inventory.read')],
    },
    stockController.getCurrentStock,
  );
}

export default stockFastifyRoutes;
