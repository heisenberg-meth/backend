import logger from '../../../shared/utils/logger.js';
import { validateEnvironment, getValidationErrors } from '../../../config/payment.config.js';
import { healthCheck as razorpayHealthCheck } from '../../../config/razorpay.js';

let workers = [];

async function startupPaymentSystem() {
  logger.info('[PAYMENT] Running startup validation...');

  const envValid = validateEnvironment();
  if (!envValid) {
    const errors = getValidationErrors();
    logger.error({ errors }, '[PAYMENT] Environment validation FAILED');
    if (process.env.NODE_ENV === 'production') {
      throw new Error(`Payment system configuration invalid: ${errors.join(', ')}`);
    }
    logger.warn('[PAYMENT] Continuing despite validation errors (non-prod)');
  }

  try {
    const health = await razorpayHealthCheck();
    if (health.status !== 'healthy') {
      logger.warn({ health }, '[PAYMENT] Razorpay gateway health check failed');
    } else {
      logger.info('[PAYMENT] Razorpay gateway connected');
    }
  } catch (error) {
    logger.warn({ error }, '[PAYMENT] Razorpay gateway unreachable at startup');
  }

  const config = (await import('../../../config/payment.config.js')).getConfig();
  logger.info(
    {
      environment: config.environment,
      keyMode: config.keyMode,
      isProduction: config.isProduction,
    },
    '[PAYMENT] System initialized',
  );
}

async function startWorkers() {
  const [{ createRecoveryWorker }, { createWebhookWorker }] = await Promise.all([
    import('../workers/recovery.worker.js'),
    import('../workers/webhook.worker.js'),
  ]);
  const { createReconciliationWorker, createDeadLetterWorker } =
    await import('../workers/reconciliation.worker.js');
  const { getQueue } = await import('../queue/payment.queue.js');

  const recoveryWorker = createRecoveryWorker();
  const webhookWorker = createWebhookWorker();
  const reconWorker = createReconciliationWorker();
  const dlqWorker = createDeadLetterWorker();

  // Schedule repeatable reconciliation every 30 minutes
  const reconQueue = getQueue('payment-reconciliation');
  if (reconQueue) {
    await reconQueue.add(
      'periodic-reconciliation',
      { tenantId: null },
      {
        repeat: { pattern: '*/30 * * * *' },
        jobId: 'periodic-reconciliation',
      },
    );
    logger.info('[PAYMENT] Scheduled periodic reconciliation (every 30m)');
  }

  workers = [recoveryWorker, webhookWorker, reconWorker, dlqWorker];
  logger.info('[PAYMENT] All workers started');
}

async function shutdownWorkers() {
  logger.info('[PAYMENT] Shutting down workers...');
  for (const worker of workers) {
    try {
      await worker.close();
    } catch (error) {
      logger.error({ error }, '[PAYMENT] Worker shutdown error');
    }
  }
  workers = [];
  logger.info('[PAYMENT] All workers stopped');
}

export { startupPaymentSystem, startWorkers, shutdownWorkers };
