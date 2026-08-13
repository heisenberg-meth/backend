import logger from '../shared/utils/logger.js';

export const activeQueues = [];
export const activeWorkers = [];

let sealed = false;

export const seal = () => {
  sealed = true;
};

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
  for (const worker of activeWorkers) {
    try {
      if (worker && typeof worker.close === 'function') {
        await worker.close();
      }
    } catch (err) {
      logger.warn({ err: err.message }, '[QUEUE_REGISTRY] Error closing worker');
    }
  }
  for (const queue of activeQueues) {
    try {
      if (queue && typeof queue.close === 'function') {
        await queue.close();
      }
    } catch (err) {
      logger.warn({ err: err.message }, '[QUEUE_REGISTRY] Error closing queue');
    }
  }
};
