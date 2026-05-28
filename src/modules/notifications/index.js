import { workers } from './queues/notification.worker.js';
import { registerWorker } from '../../config/queue-registry.js';

export const initNotificationsModule = () => {
  Object.values(workers).forEach(worker => {
    registerWorker(worker);
  });
};
