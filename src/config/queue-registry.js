import logger from '../shared/utils/logger.js';

export const activeQueues = [];
export const activeWorkers = [];

export const registerQueue = (queue) => {
  if (queue && !activeQueues.includes(queue)) {
    activeQueues.push(queue);
  }
  return queue;
};

export const registerWorker = (worker) => {
  if (worker && !activeWorkers.includes(worker)) {
    activeWorkers.push(worker);
  }
  return worker;
};

export const closeAllQueuesAndWorkers = async () => {
  // Close all registered workers first (stops processing new jobs)
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

  // Close all registered queues next
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
