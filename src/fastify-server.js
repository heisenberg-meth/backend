import './config/tracing.js';
import setupFastify from './fastify-app.js';
import env from './config/env.js';
import prisma from './config/prisma.js';
import redisClient from './config/redis.js';
import eventBus from './shared/services/eventbus.service.js';
import { initAnalyticsWorker } from './modules/billing-analytics/workers/analytics.worker.js';
import { initRiskWorker } from './modules/medicine-alerts/workers/risk.worker.js';
import { startCommunicationWorker } from './modules/communications/workers/communication.worker.js';
import { initNotificationsModule } from './modules/notifications/index.js';
import logger from './shared/utils/logger.js';

/**
 * Validate database connectivity and schema consistency before starting workers.
 * Workers must NOT process jobs until the database schema is confirmed healthy.
 */
async function validateDatabaseHealth() {
  try {
    // Step 1: Basic connectivity check
    await prisma.$queryRaw`SELECT 1`;
    logger.info('[BOOT] Database connectivity verified');

    // Step 2: Schema consistency check — verify critical tables exist
    const criticalTables = [
      'Patient', 'Invoice', 'Medicine', 'User', 'Settings',
      'Notification', 'Prescription', 'Payment', 'Tenant', 'Branch',
      'Inventory', 'InventoryBatch', 'Subscription', 'AccessRole'
    ];

    for (const table of criticalTables) {
      const modelName = table.charAt(0).toLowerCase() + table.slice(1);
      const model = prisma[modelName];
      if (model && typeof model.count === 'function') {
        await model.count().catch((err) => {
          throw new Error(`Schema inconsistency detected: ${table} table query failed - ${err.message}`);
        });
      } else {
        throw new Error(`Prisma Client error: Model ${modelName} not found in client. Run prisma generate.`);
      }
    }

    // Step 2b: Critical columns verification to prevent silent schema drift
    try {
      await prisma.$queryRaw`SELECT "status", "maxBranches", "maxUsers", "aiEnabled", "whatsappEnabled" FROM "Tenant" LIMIT 1`;
    } catch {
      throw new Error('Schema inconsistency: "Tenant" table is missing required quota/gate columns');
    }

    try {
      await prisma.$queryRaw`SELECT "failureReason", "maxRetries" FROM "Notification" LIMIT 1`;
    } catch {
      throw new Error('Schema inconsistency: "Notification" table is missing required columns (failureReason or maxRetries)');
    }

    logger.info('[BOOT] Relational schema consistency check passed');

    // Step 3: Redis connectivity
    await redisClient.ping();
    logger.info('[BOOT] Redis connectivity verified');

    return true;
  } catch (err) {
    logger.error({ err }, '[BOOT] Database validation failed — workers will NOT start');
    throw new Error(`Database validation failed: ${err.message}. Workers cannot start until schema is consistent.`);
  }
}

const start = async () => {
  let fastify;
  let isShuttingDown = false;

  const gracefulShutdown = async (signal) => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    logger.info(`\n[SHUTDOWN] Received ${signal}, shutting down gracefully...`);

    try {
      // Phase 1: Stop accepting new connections
      if (fastify) {
        await fastify.close();
        logger.info('[SHUTDOWN] Fastify server closed');
      }

      // Phase 2: Close RabbitMQ connections
      if (eventBus.connection) {
        await eventBus.connection.close();
        logger.info('[SHUTDOWN] RabbitMQ connection closed');
      }

      // Phase 3: Disconnect Prisma
      await prisma.$disconnect();
      logger.info('[SHUTDOWN] Prisma disconnected');

      // Phase 4: Quit Redis
      if (redisClient && typeof redisClient.quit === 'function') {
        await redisClient.quit();
        logger.info('[SHUTDOWN] Redis disconnected');
      }

      logger.info('[SHUTDOWN] All connections closed');
      process.exit(0);
    } catch (err) {
      console.error('[SHUTDOWN] Error during shutdown:', err.message);
      process.exit(1);
    }
  };

  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

  // Prevent unhandled promise rejections from keeping process alive
  process.on('unhandledRejection', (reason) => {
    console.error('[UNHANDLED REJECTION]', reason);
  });

  try {
    fastify = await setupFastify();
    const port = env.port || 5000;

    await fastify.listen({ port, host: '0.0.0.0' });
    fastify.log.info(`Viyan MedAssist Fastify Backend running on port ${port}`);

    await validateDatabaseHealth();

    initAnalyticsWorker();
    initRiskWorker();
    startCommunicationWorker();
    initNotificationsModule();
    logger.info('[BOOT] Workers started — all systems operational');
  } catch (err) {
    console.error('[BOOT] Failed to start server:', err.message);
    await gracefulShutdown('BOOT_ERROR');
  }
};

start();
