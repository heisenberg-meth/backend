import logger from './logger.js';

const safeImport = async (path) => {
  try {
    return await import(path);
  } catch (err) {
    logger.warn({ err: err.message }, `[CLEANUP] Could not import ${path}`);
    return {};
  }
};

const safeCall = async (obj, fn, ...args) => {
  if (obj && typeof obj[fn] === 'function') {
    try {
      await obj[fn](...args);
    } catch (err) {
      logger.warn({ err: err.message }, `[CLEANUP] Error calling ${fn}`);
    }
  }
};

/**
 * Gracefully shuts down all shared resources
 */
export const cleanupResources = async () => {
  logger.info('Starting global resource cleanup...');

  try {
    // 1. Close Registered Queues & Workers — lazily imported
    const queueRegistry = await safeImport('../../config/queue-registry.js');
    if (queueRegistry.closeAllQueuesAndWorkers) {
      await queueRegistry.closeAllQueuesAndWorkers();
    }

    // Main Queue (lazy)
    const queueModule = await safeImport('../../queue/index.js');
    if (queueModule.mainQueue) await safeCall(queueModule.mainQueue, 'close');
    if (queueModule.worker) await safeCall(queueModule.worker, 'close');

    // Webhook queue (lazy)
    const webhookMod = await safeImport('../../modules/integrations/services/webhook-queue.service.js');
    if (webhookMod.webhookQueue) await safeCall(webhookMod.webhookQueue, 'close');

    // Inventory queue (lazy)
    const invMod = await safeImport('../../modules/realtime-inventory/workers/inventory.worker.js');
    if (invMod.inventoryQueue) await safeCall(invMod.inventoryQueue, 'close');
    if (invMod.inventoryWorker) await safeCall(invMod.inventoryWorker, 'close');

    logger.info('Queues and Workers closed');

    // 2. Clear Local Event Bus Listeners
    const eventBusMod = await safeImport('../events/local-event-bus.js');
    if (eventBusMod.localEventBus && typeof eventBusMod.localEventBus.removeAllListeners === 'function') {
      eventBusMod.localEventBus.removeAllListeners();
    }

    // 3. Close ERP Event Bus
    const erpMod = await safeImport('../events/erp-event-bus.js');
    const erpEventBus = erpMod.erpEventBus || erpMod.default;
    if (erpEventBus && typeof erpEventBus.close === 'function') {
      await safeCall(erpEventBus, 'close');
    }

    // 4. Close AMQP Event Bus
    const eventBusService = await safeImport('../services/eventbus.service.js');
    const eb = eventBusService.default;
    if (eb && typeof eb.disconnect === 'function') {
      await safeCall(eb, 'disconnect');
    }
    logger.info('Event Bus closed');

    // 5. Disconnect Databases
    const prisma = (await safeImport('../../config/prisma.js')).default;
    if (prisma && typeof prisma.$disconnect === 'function') {
      try { await prisma.$disconnect(); } catch (err) {
        logger.warn({ err: err.message }, '[CLEANUP] Error disconnecting Prisma');
      }
    }

    logger.info('Databases disconnected');

    // 6. Quit Redis (should be last)
    const redisMod = await safeImport('../../config/redis.js');
    if (typeof redisMod.quitRedis === 'function') {
      await safeCall(redisMod, 'quitRedis');
    }
    logger.info('Redis disconnected');

    logger.info('Global resource cleanup completed successfully');
  } catch (err) {
    logger.error({ err }, 'Error during global resource cleanup');
  }
};
