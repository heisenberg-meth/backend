import createServiceApp from '../../shared/app-factory.js';
import paymentRoutes from '../../modules/payments/payment.fastify.routes.js';
import {
  startupPaymentSystem,
  startWorkers,
  shutdownWorkers,
} from '../../modules/payments/services/payment.startup.js';
import logger from '../../shared/utils/logger.js';

const start = async () => {
  const app = await createServiceApp({
    name: 'Payment Service',
    description: 'Handles Razorpay transactions, billing, reconciliation',
  });

  await startupPaymentSystem();

  await app.register(paymentRoutes, { prefix: '/api/payments' });

  try {
    await startWorkers();
  } catch (error) {
    logger.warn({ error }, '[PAYMENT] Worker startup failed - recovery will be degraded');
  }

  const port = process.env.SERVICE_PORT || 5003;
  await app.listen({ port, host: '0.0.0.0' });

  // Graceful shutdown
  const gracefulShutdown = async () => {
    logger.info('[PAYMENT] Shutting down...');
    await shutdownWorkers();
    await app.close();
    process.exit(0);
  };
  process.on('SIGTERM', gracefulShutdown);
  process.on('SIGINT', gracefulShutdown);
};

start();
