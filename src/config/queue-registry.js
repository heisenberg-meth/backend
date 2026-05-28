import logger from '../shared/utils/logger.js';

export const activeQueues = [];
export const activeWorkers = [];

let sealed = false;

export const seal = () => {
  sealed = true;
};

export const isSealed = () => sealed;

export const registerQueue = (queue) => {
  if (sealed) {
    logger.warn('[QUEUE_REGISTRY] Attempted to register queue after bootstrap seal — ignored');
    return queue;
  }
  if (queue && !activeQueues.includes(queue)) {
    activeQueues.push(queue);
  }
  return queue;
};

export const registerWorker = (worker) => {
  if (sealed) {
    logger.warn('[QUEUE_REGISTRY] Attempted to register worker after bootstrap seal — ignored');
    return worker;
  }
  if (worker && !activeWorkers.includes(worker)) {
    activeWorkers.push(worker);
  }
  return worker;
};

export const closeAllQueuesAndWorkers = async () => {
  sealed = true;

  const workerPromises = activeWorkers.map(async (worker) => {
    try {
      if (worker && typeof worker.close === 'function' && !worker.closing) {
        await worker.close();
      }
    } catch (err) {
      logger.error('Error closing worker:', err);
    }
  });
  await Promise.all(workerPromises);
  activeWorkers.length = 0;

  const queuePromises = activeQueues.map(async (queue) => {
    try {
      if (queue && typeof queue.close === 'function' && !queue.closing) {
        await queue.close();
      }
    } catch (err) {
      logger.error('Error closing queue:', err);
    }
  });
  await Promise.all(queuePromises);
  activeQueues.length = 0;
};
