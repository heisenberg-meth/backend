import { createNotificationWorkers, workers } from './queues/notification.worker.js';
import { registerWorker } from '../../config/queue-registry.js';

export const initNotificationsModule = () => {
  createNotificationWorkers();
  if (workers) {
    Object.values(workers).forEach(worker => {
      registerWorker(worker);
    });
  }
};
