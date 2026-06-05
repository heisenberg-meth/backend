import { Queue } from 'bullmq';
import { getBullRedis } from '../../../config/redis.js';
import logger from '../../../shared/utils/logger.js';

const queues = {};

function getQueue(name) {
  if (process.env.NODE_ENV === 'test') return null;
  if (queues[name]) return queues[name];

  const queue = new Queue(name, {
    connection: getBullRedis(),
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
      removeOnComplete: { age: 3600 },
      removeOnFail: { age: 604800 },
    },
  });

  queues[name] = queue;
  return queue;
}

async function enqueuePaymentRecovery(tenantId, orderId) {
  const queue = getQueue('payment-recovery');
  return queue.add(
    'recover_orphans',
    { type: 'recover_orphans', tenantId, orderId },
    {
      jobId: `recovery:${orderId || tenantId}:${Date.now()}`,
      attempts: 5,
      backoff: { type: 'exponential', delay: 5000 },
    },
  );
}

async function enqueueReconciliation(tenantId = null) {
  const queue = getQueue('payment-reconciliation');
  return queue.add(
    'reconcile',
    { tenantId },
    {
      jobId: `reconcile:${tenantId || 'all'}:${Date.now()}`,
      attempts: 3,
    },
  );
}

async function enqueueWebhook(event, payload) {
  const queue = getQueue('payment-webhook');
  return queue.add(
    event,
    { event, payload },
    {
      jobId: `webhook:${payload.event_id || payload.payload?.payment?.entity?.id}:${Date.now()}`,
      attempts: 5,
      backoff: { type: 'exponential', delay: 1000 },
    },
  );
}

async function enqueueDeadLetter(originalQueue, jobData, error) {
  const queue = getQueue('payment-dlq');
  return queue.add(
    'dead_letter',
    { originalQueue, jobData, error: error.message, failedAt: new Date().toISOString() },
    {
      attempts: 1,
    },
  );
}

async function getQueueMetrics() {
  const metrics = {};
  const queueNames = [
    'payment-recovery',
    'payment-reconciliation',
    'payment-webhook',
    'payment-dlq',
  ];

  for (const name of queueNames) {
    try {
      const queue = getQueue(name);
      const [waiting, active, completed, failed, delayed] = await Promise.all([
        queue.getWaitingCount(),
        queue.getActiveCount(),
        queue.getCompletedCount(),
        queue.getFailedCount(),
        queue.getDelayedCount(),
      ]);
      metrics[name] = { waiting, active, completed, failed, delayed };
    } catch (error) {
      logger.error({ error, queue: name }, '[QUEUE] Metrics error');
    }
  }

  return metrics;
}

export {
  getQueue,
  enqueuePaymentRecovery,
  enqueueReconciliation,
  enqueueWebhook,
  enqueueDeadLetter,
  getQueueMetrics,
};
